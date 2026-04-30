import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  buildInvestorDirectChangePayload,
  hasMeaningfulInvestorChanges,
  sanitizeInvestorMasterSnapshot,
  serializeInvestorMasterChangeRequest,
} from "@/lib/investor-master";
import {
  computeInvestorLedgerTotals,
  toInvestorSnapshot,
} from "@/lib/investor";

function canReadInvestors(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
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

function canManageInvestors(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasGlobal("investors.manage");
}

async function resolveInvestorId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const investorId = Number(id);
  if (!Number.isInteger(investorId) || investorId <= 0) {
    throw new Error("Invalid investor id.");
  }
  return investorId;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const investorId = await resolveInvestorId(params);

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        portalAccesses: {
          orderBy: [{ createdAt: "desc" }],
          take: 3,
          include: {
            user: { select: { id: true, name: true, email: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        documents: {
          orderBy: [{ type: "asc" }],
          include: {
            reviewedBy: { select: { id: true, name: true, email: true } },
          },
        },
        changeRequests: {
          orderBy: [{ requestedAt: "desc" }],
          take: 20,
          include: {
            requestedBy: { select: { id: true, name: true, email: true } },
            reviewedBy: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: {
            transactions: true,
            allocations: true,
            payouts: true,
            documents: true,
            changeRequests: true,
          },
        },
      },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found." },
        { status: 404 },
      );
    }

    const transactionTotals = await prisma.investorCapitalTransaction.groupBy({
      by: ["direction"],
      where: { investorId },
      _sum: { amount: true },
    });

    const totals = computeInvestorLedgerTotals(
      transactionTotals.map((item) => ({
        direction: item.direction,
        amount: item._sum.amount ?? new Prisma.Decimal(0),
      })),
    );

    const recentActivity = await prisma.activityLog.findMany({
      where: {
        entityId: String(investorId),
        entity: {
          startsWith: "investor",
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        userId: true,
        metadata: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      investor: {
        ...investor,
        createdAt: investor.createdAt.toISOString(),
        updatedAt: investor.updatedAt.toISOString(),
        kycVerifiedAt: investor.kycVerifiedAt?.toISOString() ?? null,
        totals: {
          credit: totals.credit.toString(),
          debit: totals.debit.toString(),
          balance: totals.balance.toString(),
        },
      },
      changeRequests: investor.changeRequests.map((request) =>
        serializeInvestorMasterChangeRequest(request),
      ),
      recentActivity: recentActivity.map((item) => ({
        id: String(item.id),
        action: item.action,
        entity: item.entity,
        entityId: item.entityId,
        createdAt: item.createdAt.toISOString(),
        userId: item.userId,
        metadata: item.metadata,
        user: item.user,
      })),
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR DETAIL GET ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load investor detail." },
      { status: error?.message === "Invalid investor id." ? 400 : 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const investorId = await resolveInvestorId(params);
    const existing = await prisma.investor.findUnique({
      where: { id: investorId },
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        email: true,
        phone: true,
        taxNumber: true,
        nationalIdNumber: true,
        passportNumber: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        beneficiaryVerifiedAt: true,
        beneficiaryVerifiedById: true,
        beneficiaryVerificationNote: true,
        status: true,
        kycStatus: true,
        kycReference: true,
        notes: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Investor not found." },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const directPayload = buildInvestorDirectChangePayload(body);

    if (
      body.legalName !== undefined ||
      body.taxNumber !== undefined ||
      body.nationalIdNumber !== undefined ||
      body.passportNumber !== undefined ||
      body.bankName !== undefined ||
      body.bankAccountName !== undefined ||
      body.bankAccountNumber !== undefined ||
      body.status !== undefined ||
      body.kycReference !== undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Sensitive investor fields must go through a master change request for approval.",
        },
        { status: 400 },
      );
    }

    if (directPayload.name !== undefined && !directPayload.name) {
      return NextResponse.json(
        { error: "Investor name cannot be empty." },
        { status: 400 },
      );
    }

    const current = sanitizeInvestorMasterSnapshot(existing);
    if (
      !hasMeaningfulInvestorChanges(
        directPayload as Record<string, unknown>,
        current,
      )
    ) {
      return NextResponse.json(
        { error: "No direct fields changed." },
        { status: 400 },
      );
    }

    const updated = await prisma.investor.update({
      where: { id: investorId },
      data: directPayload,
    });

    await logActivity({
      action: "update",
      entity: "investor",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated investor ${updated.name} (${updated.code})`,
      },
      before: toInvestorSnapshot(existing),
      after: toInvestorSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("ADMIN INVESTOR DETAIL PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update investor." },
      { status: error?.message === "Invalid investor id." ? 400 : 500 },
    );
  }
}
