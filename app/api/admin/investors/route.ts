import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  INVESTOR_KYC_STATUS_VALUES,
  INVESTOR_STATUS_VALUES,
  computeInvestorLedgerTotals,
  generateInvestorCode,
  normalizeInvestorCode,
  parseInvestorKycStatus,
  parseInvestorStatus,
  toCleanText,
  toInvestorSnapshot,
} from "@/lib/investor";

function canReadInvestors(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("investors.read") ||
    access.hasGlobal("investors.manage") ||
    access.hasGlobal("investor_ledger.read") ||
    access.hasGlobal("investor_ledger.manage") ||
    access.hasGlobal("investor_allocations.read") ||
    access.hasGlobal("investor_allocations.manage") ||
    access.hasGlobal("investor_profit.read") ||
    access.hasGlobal("investor_profit.manage") ||
    access.hasGlobal("investor_profit.approve") ||
    access.hasGlobal("investor_profit.post") ||
    access.hasGlobal("investor_payout.read") ||
    access.hasGlobal("investor_payout.manage") ||
    access.hasGlobal("investor_payout.approve") ||
    access.hasGlobal("investor_payout.pay") ||
    access.hasGlobal("investor_payout.void") ||
    access.hasGlobal("investor_statement.read")
  );
}

function canManageInvestors(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investors.manage");
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadInvestors(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const statusFilter = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() || "";
    const kycFilter = request.nextUrl.searchParams.get("kycStatus")?.trim().toUpperCase() || "";
    const validStatusFilter = INVESTOR_STATUS_VALUES.find((value) => value === statusFilter);
    const validKycFilter = INVESTOR_KYC_STATUS_VALUES.find((value) => value === kycFilter);

    const investors = await prisma.investor.findMany({
      where: {
        ...(validStatusFilter ? { status: validStatusFilter } : {}),
        ...(validKycFilter ? { kycStatus: validKycFilter } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { legalName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        email: true,
        phone: true,
        status: true,
        kycStatus: true,
        kycVerifiedAt: true,
        kycReference: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            transactions: true,
            allocations: true,
          },
        },
      },
    });

    const aggregates = await prisma.investorCapitalTransaction.groupBy({
      by: ["investorId", "direction"],
      _sum: {
        amount: true,
      },
    });

    const amountMap = new Map<number, { credit: string; debit: string; balance: string }>();
    for (const investor of investors) {
      const items = aggregates
        .filter((aggregate) => aggregate.investorId === investor.id)
        .map((aggregate) => ({
          direction: aggregate.direction,
          amount: aggregate._sum.amount ?? new Prisma.Decimal(0),
        }));
      const totals = computeInvestorLedgerTotals(items);
      amountMap.set(investor.id, {
        credit: totals.credit.toString(),
        debit: totals.debit.toString(),
        balance: totals.balance.toString(),
      });
    }

    return NextResponse.json(
      investors.map((investor) => ({
        ...investor,
        createdAt: investor.createdAt.toISOString(),
        updatedAt: investor.updatedAt.toISOString(),
        kycVerifiedAt: investor.kycVerifiedAt?.toISOString() ?? null,
        totals: amountMap.get(investor.id) ?? {
          credit: "0",
          debit: "0",
          balance: "0",
        },
      })),
    );
  } catch (error) {
    console.error("ADMIN INVESTORS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investors." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageInvestors(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = toCleanText(body.name, 120);
    if (!name) {
      return NextResponse.json({ error: "Investor name is required." }, { status: 400 });
    }

    const requestedCode = normalizeInvestorCode(body.code);
    const created = await prisma.$transaction(async (tx) => {
      const code = requestedCode || (await generateInvestorCode(tx));
      return tx.investor.create({
        data: {
          code,
          name,
          legalName: toCleanText(body.legalName, 160) || null,
          email: toCleanText(body.email, 160) || null,
          phone: toCleanText(body.phone, 40) || null,
          taxNumber: toCleanText(body.taxNumber, 120) || null,
          nationalIdNumber: toCleanText(body.nationalIdNumber, 120) || null,
          passportNumber: toCleanText(body.passportNumber, 120) || null,
          bankName: toCleanText(body.bankName, 160) || null,
          bankAccountName: toCleanText(body.bankAccountName, 160) || null,
          bankAccountNumber: toCleanText(body.bankAccountNumber, 160) || null,
          status: parseInvestorStatus(body.status),
          kycStatus: parseInvestorKycStatus(body.kycStatus),
          kycReference: toCleanText(body.kycReference, 120) || null,
          notes: toCleanText(body.notes, 500) || null,
          createdById: access.userId,
        },
      });
    });

    await logActivity({
      action: "create",
      entity: "investor",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created investor ${created.name} (${created.code})`,
      },
      after: toInvestorSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("ADMIN INVESTORS POST ERROR:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Investor code already exists." }, { status: 409 });
    }
    return NextResponse.json(
      { error: error?.message || "Failed to create investor." },
      { status: 500 },
    );
  }
}
