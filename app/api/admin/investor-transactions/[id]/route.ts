import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { computeInvestorLedgerTotals } from "@/lib/investor";

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

async function resolveTransactionId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    throw new Error("Invalid transaction id.");
  }
  return transactionId;
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
    if (!canReadInvestorLedger(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const transactionId = await resolveTransactionId(params);
    const transaction = await prisma.investorCapitalTransaction.findUnique({
      where: { id: transactionId },
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            kycStatus: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            sku: true,
            product: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        payout: {
          select: {
            id: true,
            payoutNumber: true,
            status: true,
            paidAt: true,
            payoutAmount: true,
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    const [ledgerEntries, relatedTransactions] = await Promise.all([
      prisma.investorCapitalTransaction.findMany({
        where: { investorId: transaction.investorId },
        orderBy: [{ transactionDate: "asc" }, { id: "asc" }],
        select: {
          id: true,
          transactionNumber: true,
          transactionDate: true,
          type: true,
          direction: true,
          amount: true,
        },
      }),
      prisma.investorCapitalTransaction.findMany({
        where: {
          investorId: transaction.investorId,
          productVariantId: transaction.productVariantId,
          id: { not: transaction.id },
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          transactionNumber: true,
          transactionDate: true,
          type: true,
          direction: true,
          amount: true,
          currency: true,
        },
      }),
    ]);

    let runningBalance = new Prisma.Decimal(0);
    for (const entry of ledgerEntries) {
      if (entry.direction === "CREDIT") {
        runningBalance = runningBalance.plus(entry.amount);
      } else {
        runningBalance = runningBalance.minus(entry.amount);
      }
      if (entry.id === transaction.id) break;
    }

    const totals = computeInvestorLedgerTotals(
      ledgerEntries.map((entry) => ({
        direction: entry.direction,
        amount: entry.amount,
      })),
    );

    return NextResponse.json({
      transaction: {
        ...transaction,
        amount: transaction.amount.toString(),
        transactionDate: transaction.transactionDate.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString(),
        runningBalance: runningBalance.toString(),
        payout: transaction.payout
          ? {
              ...transaction.payout,
              payoutAmount: transaction.payout.payoutAmount.toString(),
              paidAt: transaction.payout.paidAt?.toISOString() ?? null,
            }
          : null,
      },
      investorTotals: {
        credit: totals.credit.toString(),
        debit: totals.debit.toString(),
        balance: totals.balance.toString(),
      },
      relatedTransactions: relatedTransactions.map((item) => ({
        ...item,
        amount: item.amount.toString(),
        transactionDate: item.transactionDate.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR TRANSACTION DETAIL GET ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load investor transaction detail." },
      { status: error?.message === "Invalid transaction id." ? 400 : 500 },
    );
  }
}
