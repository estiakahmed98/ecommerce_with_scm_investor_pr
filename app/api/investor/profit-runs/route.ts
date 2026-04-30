import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToString, resolveInvestorRequestContext } from "@/app/api/investor/shared";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!resolved.context.access.has("investor.portal.profit.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const runIdParam = Number(request.nextUrl.searchParams.get("runId") || "");

    const runs = await prisma.investorProfitRun.findMany({
      where: {
        OR: [
          { allocationLines: { some: { investorId: resolved.context.investorId } } },
          { payouts: { some: { investorId: resolved.context.investorId } } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 40,
      select: {
        id: true,
        runNumber: true,
        status: true,
        fromDate: true,
        toDate: true,
        totalNetRevenue: true,
        totalNetCogs: true,
        totalOperatingExpense: true,
        totalNetProfit: true,
        createdAt: true,
        approvedAt: true,
        postedAt: true,
      },
    });

    const selectedRunId =
      Number.isInteger(runIdParam) && runIdParam > 0
        ? runIdParam
        : runs.length > 0
          ? runs[0].id
          : null;

    if (!selectedRunId) {
      return NextResponse.json({
        investor: {
          id: resolved.context.investorId,
          code: resolved.context.investorCode,
          name: resolved.context.investorName,
        },
        runs: [],
        selectedRunId: null,
        allocationLines: [],
        payouts: [],
      });
    }

    const [allocationLines, payouts] = await Promise.all([
      prisma.investorProfitRunAllocation.findMany({
        where: {
          runId: selectedRunId,
          investorId: resolved.context.investorId,
        },
        orderBy: [{ allocatedNetProfit: "desc" }, { id: "asc" }],
        select: {
          id: true,
          participationSharePct: true,
          allocatedRevenue: true,
          allocatedNetProfit: true,
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
          sourceAllocation: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      }),
      prisma.investorProfitPayout.findMany({
        where: {
          runId: selectedRunId,
          investorId: resolved.context.investorId,
        },
        orderBy: [{ id: "desc" }],
        select: {
          id: true,
          payoutNumber: true,
          status: true,
          payoutPercent: true,
          holdbackPercent: true,
          payoutAmount: true,
          currency: true,
          paymentMethod: true,
          createdAt: true,
          paidAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      investor: {
        id: resolved.context.investorId,
        code: resolved.context.investorCode,
        name: resolved.context.investorName,
      },
      runs: runs.map((item) => ({
        ...item,
        totalNetRevenue: decimalToString(item.totalNetRevenue),
        totalNetCogs: decimalToString(item.totalNetCogs),
        totalOperatingExpense: decimalToString(item.totalOperatingExpense),
        totalNetProfit: decimalToString(item.totalNetProfit),
        fromDate: item.fromDate.toISOString(),
        toDate: item.toDate.toISOString(),
        createdAt: item.createdAt.toISOString(),
        approvedAt: item.approvedAt?.toISOString() ?? null,
        postedAt: item.postedAt?.toISOString() ?? null,
      })),
      selectedRunId,
      allocationLines: allocationLines.map((item) => ({
        ...item,
        participationSharePct: decimalToString(item.participationSharePct),
        allocatedRevenue: decimalToString(item.allocatedRevenue),
        allocatedNetProfit: decimalToString(item.allocatedNetProfit),
      })),
      payouts: payouts.map((item) => ({
        ...item,
        payoutPercent: decimalToString(item.payoutPercent),
        holdbackPercent: decimalToString(item.holdbackPercent),
        payoutAmount: decimalToString(item.payoutAmount),
        createdAt: item.createdAt.toISOString(),
        paidAt: item.paidAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL PROFIT RUNS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor profit runs." }, { status: 500 });
  }
}
