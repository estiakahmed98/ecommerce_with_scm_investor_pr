import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  computeInvestorLedgerTotals,
  generateInvestorTransactionNumber,
  parseInvestorTransactionType,
  resolveTransactionDirection,
  toCleanText,
  toDecimalAmount,
  toInvestorTransactionSnapshot,
} from "@/lib/investor";

function canReadInvestorLedger(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("investor_ledger.read") ||
    access.hasGlobal("investor_ledger.manage") ||
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

function canManageInvestorLedger(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_ledger.manage");
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
    if (!canReadInvestorLedger(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const investorId = Number(request.nextUrl.searchParams.get("investorId") || "");
    const where =
      Number.isInteger(investorId) && investorId > 0
        ? { investorId }
        : {};

    const [transactions, investors, variants] = await Promise.all([
      prisma.investorCapitalTransaction.findMany({
        where,
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        include: {
          investor: {
            select: { id: true, code: true, name: true, status: true },
          },
          productVariant: {
            select: {
              id: true,
              sku: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        take: 600,
      }),
      prisma.investor.findMany({
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          kycStatus: true,
        },
      }),
      prisma.productVariant.findMany({
        where: { active: true },
        orderBy: [{ sku: "asc" }],
        select: {
          id: true,
          sku: true,
          product: {
            select: { id: true, name: true },
          },
        },
        take: 500,
      }),
    ]);

    const summaryByInvestor = new Map<number, { debit: string; credit: string; balance: string }>();
    for (const investor of investors) {
      const ledgerTotals = computeInvestorLedgerTotals(
        transactions
          .filter((transaction) => transaction.investorId === investor.id)
          .map((transaction) => ({
            direction: transaction.direction,
            amount: transaction.amount,
          })),
      );
      summaryByInvestor.set(investor.id, {
        debit: ledgerTotals.debit.toString(),
        credit: ledgerTotals.credit.toString(),
        balance: ledgerTotals.balance.toString(),
      });
    }

    return NextResponse.json({
      investors: investors.map((investor) => ({
        ...investor,
        totals: summaryByInvestor.get(investor.id) ?? {
          debit: "0",
          credit: "0",
          balance: "0",
        },
      })),
      variants,
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amount: transaction.amount.toString(),
        transactionDate: transaction.transactionDate.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR TRANSACTIONS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor transactions." },
      { status: 500 },
    );
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
    if (!canManageInvestorLedger(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      investorId?: unknown;
      type?: unknown;
      direction?: unknown;
      transactionDate?: unknown;
      amount?: unknown;
      currency?: unknown;
      note?: unknown;
      referenceType?: unknown;
      referenceNumber?: unknown;
      productVariantId?: unknown;
    };

    const investorId = Number(body.investorId);
    if (!Number.isInteger(investorId) || investorId <= 0) {
      return NextResponse.json({ error: "Investor is required." }, { status: 400 });
    }

    const type = parseInvestorTransactionType(body.type);
    const direction = resolveTransactionDirection({
      type,
      requestedDirection: body.direction,
    });

    const amount = toDecimalAmount(body.amount, "Transaction amount");
    if (amount.lte(0)) {
      return NextResponse.json(
        { error: "Transaction amount must be greater than zero." },
        { status: 400 },
      );
    }

    const transactionDate = body.transactionDate
      ? new Date(String(body.transactionDate))
      : new Date();
    if (Number.isNaN(transactionDate.getTime())) {
      return NextResponse.json({ error: "Invalid transaction date." }, { status: 400 });
    }

    const productVariantId =
      body.productVariantId === null || body.productVariantId === undefined || body.productVariantId === ""
        ? null
        : Number(body.productVariantId);
    if (
      productVariantId !== null &&
      (!Number.isInteger(productVariantId) || productVariantId <= 0)
    ) {
      return NextResponse.json({ error: "Invalid product variant." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const investor = await tx.investor.findUnique({
        where: { id: investorId },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
        },
      });
      if (!investor) {
        throw new Error("Investor not found.");
      }
      if (investor.status !== "ACTIVE") {
        throw new Error("Only ACTIVE investors can post capital transactions.");
      }

      if (productVariantId !== null) {
        const variant = await tx.productVariant.findUnique({
          where: { id: productVariantId },
          select: { id: true },
        });
        if (!variant) {
          throw new Error("Selected product variant not found.");
        }
      }

      if (direction === "DEBIT") {
        const grouped = await tx.investorCapitalTransaction.groupBy({
          by: ["direction"],
          where: { investorId },
          _sum: {
            amount: true,
          },
        });
        const totals = computeInvestorLedgerTotals(
          grouped.map((item) => ({
            direction: item.direction,
            amount: item._sum.amount ?? new Prisma.Decimal(0),
          })),
        );
        if (amount.gt(totals.balance)) {
          throw new Error(
            "Debit transaction exceeds available investor balance. Post contribution/profit first or reduce amount.",
          );
        }
      }

      const transactionNumber = await generateInvestorTransactionNumber(tx, transactionDate);
      return tx.investorCapitalTransaction.create({
        data: {
          transactionNumber,
          investorId,
          transactionDate,
          type,
          direction,
          amount,
          currency: toCleanText(body.currency, 3).toUpperCase() || "BDT",
          note: toCleanText(body.note, 500) || null,
          referenceType: toCleanText(body.referenceType, 80) || null,
          referenceNumber: toCleanText(body.referenceNumber, 120) || null,
          productVariantId,
          createdById: access.userId,
        },
      });
    });

    await logActivity({
      action: "create",
      entity: "investor_capital_transaction",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Posted investor transaction ${created.transactionNumber}`,
      },
      after: toInvestorTransactionSnapshot(created),
    });

    return NextResponse.json(
      {
        ...created,
        amount: created.amount.toString(),
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("ADMIN INVESTOR TRANSACTIONS POST ERROR:", error);
    const message = String(error?.message || "");
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Duplicate transaction reference." }, { status: 409 });
    }
    if (
      message.includes("required") ||
      message.includes("Invalid") ||
      message.includes("must be") ||
      message.includes("exceeds") ||
      message.includes("Only ACTIVE investors")
    ) {
      return NextResponse.json({ error: message || "Invalid request." }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message || "Resource not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: message || "Failed to create investor transaction." },
      { status: 500 },
    );
  }
}
