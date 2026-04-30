import { Prisma } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToString, resolveInvestorRequestContext } from "@/app/api/investor/shared";

export async function GET() {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!resolved.context.access.has("investor.portal.payout.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payouts = await prisma.investorProfitPayout.findMany({
      where: { investorId: resolved.context.investorId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        payoutNumber: true,
        status: true,
        payoutPercent: true,
        holdbackPercent: true,
        grossProfitAmount: true,
        holdbackAmount: true,
        payoutAmount: true,
        currency: true,
        paymentMethod: true,
        bankReference: true,
        createdAt: true,
        approvedAt: true,
        paidAt: true,
        voidedAt: true,
        run: {
          select: {
            id: true,
            runNumber: true,
            fromDate: true,
            toDate: true,
          },
        },
        transaction: {
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            amount: true,
          },
        },
      },
      take: 300,
    });

    const totals = payouts.reduce(
      (acc, item) => {
        acc.count += 1;
        acc.amount = acc.amount.plus(item.payoutAmount);
        if (item.status === "PAID") {
          acc.paidAmount = acc.paidAmount.plus(item.payoutAmount);
          acc.paidCount += 1;
        }
        return acc;
      },
      {
        count: 0,
        paidCount: 0,
        amount: new Prisma.Decimal(0),
        paidAmount: new Prisma.Decimal(0),
      },
    );

    return NextResponse.json({
      investor: {
        id: resolved.context.investorId,
        code: resolved.context.investorCode,
        name: resolved.context.investorName,
      },
      summary: {
        payoutCount: totals.count,
        paidCount: totals.paidCount,
        totalAmount: totals.amount.toString(),
        paidAmount: totals.paidAmount.toString(),
      },
      payouts: payouts.map((item) => ({
        ...item,
        payoutPercent: decimalToString(item.payoutPercent),
        holdbackPercent: decimalToString(item.holdbackPercent),
        grossProfitAmount: decimalToString(item.grossProfitAmount),
        holdbackAmount: decimalToString(item.holdbackAmount),
        payoutAmount: decimalToString(item.payoutAmount),
        createdAt: item.createdAt.toISOString(),
        approvedAt: item.approvedAt?.toISOString() ?? null,
        paidAt: item.paidAt?.toISOString() ?? null,
        voidedAt: item.voidedAt?.toISOString() ?? null,
        run: {
          ...item.run,
          fromDate: item.run.fromDate.toISOString(),
          toDate: item.run.toDate.toISOString(),
        },
        transaction: item.transaction
          ? {
              ...item.transaction,
              amount: decimalToString(item.transaction.amount),
              transactionDate: item.transaction.transactionDate.toISOString(),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL PAYOUTS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor payouts." }, { status: 500 });
  }
}
