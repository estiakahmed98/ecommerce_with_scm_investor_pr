import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

function canReadPayout(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("investor_payout.read") ||
    access.hasGlobal("investor_payout.manage") ||
    access.hasGlobal("investor_payout.approve") ||
    access.hasGlobal("investor_payout.pay") ||
    access.hasGlobal("investor_payout.void") ||
    access.hasGlobal("investor_statement.read")
  );
}

function serializePayoutListItem(payout: any) {
  return {
    ...payout,
    payoutPercent: payout.payoutPercent.toString(),
    holdbackPercent: payout.holdbackPercent.toString(),
    grossProfitAmount: payout.grossProfitAmount.toString(),
    holdbackAmount: payout.holdbackAmount.toString(),
    payoutAmount: payout.payoutAmount.toString(),
    approvedAt: payout.approvedAt?.toISOString() ?? null,
    rejectedAt: payout.rejectedAt?.toISOString() ?? null,
    heldAt: payout.heldAt?.toISOString() ?? null,
    releasedAt: payout.releasedAt?.toISOString() ?? null,
    paidAt: payout.paidAt?.toISOString() ?? null,
    voidedAt: payout.voidedAt?.toISOString() ?? null,
    createdAt: payout.createdAt.toISOString(),
  };
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
    if (!canReadPayout(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const investorId = Number(request.nextUrl.searchParams.get("investorId") || "");
    const runId = Number(request.nextUrl.searchParams.get("runId") || "");
    const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() || "";

    const payouts = await prisma.investorProfitPayout.findMany({
      where: {
        ...(Number.isInteger(investorId) && investorId > 0 ? { investorId } : {}),
        ...(Number.isInteger(runId) && runId > 0 ? { runId } : {}),
        ...(status &&
        ["PENDING_APPROVAL", "APPROVED", "REJECTED", "PAID", "VOID"].includes(status)
          ? { status: status as "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PAID" | "VOID" }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 300,
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            beneficiaryVerifiedAt: true,
          },
        },
        run: {
          select: {
            id: true,
            runNumber: true,
            status: true,
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
    });

    return NextResponse.json({
      payouts: payouts.map((item) => ({
        ...serializePayoutListItem(item),
        investor: {
          ...item.investor,
          beneficiaryVerifiedAt: item.investor.beneficiaryVerifiedAt?.toISOString() ?? null,
        },
        run: {
          ...item.run,
          fromDate: item.run.fromDate.toISOString(),
          toDate: item.run.toDate.toISOString(),
        },
        transaction: item.transaction
          ? {
              ...item.transaction,
              amount: item.transaction.amount.toString(),
              transactionDate: item.transaction.transactionDate.toISOString(),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR PAYOUTS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor payouts." }, { status: 500 });
  }
}

