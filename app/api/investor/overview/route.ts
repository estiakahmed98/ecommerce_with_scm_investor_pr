import { Prisma } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveInvestorRequestContext, decimalToString } from "@/app/api/investor/shared";

export async function GET() {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!resolved.context.access.has("investor.portal.overview.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { investorId, investorCode, investorName } = resolved.context;

    const [
      totalsGrouped,
      allocations,
      recentTransactions,
      recentPayouts,
      recentRuns,
      unreadNotificationCount,
      pendingProfileRequestCount,
    ] =
      await Promise.all([
        prisma.investorCapitalTransaction.groupBy({
          by: ["direction"],
          where: { investorId },
          _sum: { amount: true },
        }),
        prisma.investorProductAllocation.findMany({
          where: { investorId },
          select: { id: true, status: true },
        }),
        prisma.investorCapitalTransaction.findMany({
          where: { investorId },
          orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
          take: 8,
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
        prisma.investorProfitPayout.findMany({
          where: { investorId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 8,
          select: {
            id: true,
            payoutNumber: true,
            status: true,
            payoutAmount: true,
            currency: true,
            createdAt: true,
            paidAt: true,
            run: {
              select: {
                id: true,
                runNumber: true,
              },
            },
          },
        }),
        prisma.investorProfitRun.findMany({
          where: {
            OR: [
              { allocationLines: { some: { investorId } } },
              { payouts: { some: { investorId } } },
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 8,
          select: {
            id: true,
            runNumber: true,
            status: true,
            fromDate: true,
            toDate: true,
            totalNetProfit: true,
            createdAt: true,
          },
        }),
        prisma.investorPortalNotification.count({
          where: {
            investorId,
            status: "UNREAD",
          },
        }),
        prisma.investorProfileUpdateRequest.count({
          where: {
            investorId,
            status: "PENDING",
          },
        }),
      ]);

    const credit = totalsGrouped
      .filter((item) => item.direction === "CREDIT")
      .reduce((sum, item) => sum.plus(item._sum.amount ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
    const debit = totalsGrouped
      .filter((item) => item.direction === "DEBIT")
      .reduce((sum, item) => sum.plus(item._sum.amount ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));
    const balance = credit.minus(debit);

    const payoutTotals = recentPayouts.reduce(
      (sum, payout) => sum.plus(payout.payoutAmount),
      new Prisma.Decimal(0),
    );

    return NextResponse.json({
      investor: {
        id: investorId,
        code: investorCode,
        name: investorName,
      },
      summary: {
        totalCredit: credit.toString(),
        totalDebit: debit.toString(),
        balance: balance.toString(),
        allocationCount: allocations.length,
        activeAllocationCount: allocations.filter((item) => item.status === "ACTIVE").length,
        recentPayoutTotal: payoutTotals.toString(),
        unreadNotificationCount,
        pendingProfileRequestCount,
      },
      recentTransactions: recentTransactions.map((item) => ({
        ...item,
        amount: decimalToString(item.amount),
        transactionDate: item.transactionDate.toISOString(),
      })),
      recentPayouts: recentPayouts.map((item) => ({
        ...item,
        payoutAmount: decimalToString(item.payoutAmount),
        createdAt: item.createdAt.toISOString(),
        paidAt: item.paidAt?.toISOString() ?? null,
      })),
      recentRuns: recentRuns.map((item) => ({
        ...item,
        totalNetProfit: decimalToString(item.totalNetProfit),
        fromDate: item.fromDate.toISOString(),
        toDate: item.toDate.toISOString(),
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL OVERVIEW GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor portal overview." },
      { status: 500 },
    );
  }
}
