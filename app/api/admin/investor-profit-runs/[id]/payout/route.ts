import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateInvestorProfitPayoutNumber,
  toCleanText,
  toDecimalAmount,
} from "@/lib/investor";
import { toPayoutSnapshotFromInvestor } from "@/lib/investor-payout";
import { createInvestorInternalNotificationsForPermissions } from "@/lib/investor-internal-notifications";

function canManageInvestorPayout(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_payout.manage");
}

type PayoutCandidate = {
  investorId: number;
  grossProfitAmount: Prisma.Decimal;
  payoutAmount: Prisma.Decimal;
  holdbackAmount: Prisma.Decimal;
};

export async function POST(
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
    if (!canManageInvestorPayout(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const runId = Number(id);
    if (!Number.isInteger(runId) || runId <= 0) {
      return NextResponse.json({ error: "Invalid profit run id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const payoutPercent = toDecimalAmount(body.payoutPercent ?? 100, "Payout percent");
    const holdbackPercent = toDecimalAmount(body.holdbackPercent ?? 0, "Holdback percent");
    const note = toCleanText(body.note, 500) || null;
    const currency = toCleanText(body.currency, 3).toUpperCase() || "BDT";

    if (payoutPercent.lte(0) || payoutPercent.gt(100)) {
      return NextResponse.json(
        { error: "Payout percent must be between 0 and 100." },
        { status: 400 },
      );
    }
    if (holdbackPercent.lt(0) || holdbackPercent.gt(100)) {
      return NextResponse.json(
        { error: "Holdback percent must be between 0 and 100." },
        { status: 400 },
      );
    }

    const run = await prisma.investorProfitRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        runNumber: true,
        status: true,
      },
    });
    if (!run) {
      return NextResponse.json({ error: "Investor profit run not found." }, { status: 404 });
    }
    if (run.status !== "POSTED") {
      return NextResponse.json(
        { error: "Run must be POSTED before creating payouts." },
        { status: 400 },
      );
    }

    const [profitByInvestor, settledByInvestor] = await Promise.all([
      prisma.investorProfitRunAllocation.groupBy({
        by: ["investorId"],
        where: {
          runId,
          allocatedNetProfit: { gt: 0 },
        },
        _sum: {
          allocatedNetProfit: true,
        },
      }),
      prisma.investorProfitPayout.groupBy({
        by: ["investorId"],
        where: {
          runId,
          status: {
            in: ["PENDING_APPROVAL", "APPROVED", "PAID"],
          },
        },
        _sum: {
          payoutAmount: true,
        },
      }),
    ]);

    const settledMap = new Map<number, Prisma.Decimal>();
    for (const row of settledByInvestor) {
      settledMap.set(row.investorId, row._sum.payoutAmount ?? new Prisma.Decimal(0));
    }

    const payoutFactor = payoutPercent.div(100);
    const holdbackFactor = holdbackPercent.div(100);

    const candidates: PayoutCandidate[] = [];
    for (const row of profitByInvestor) {
      const totalProfit = row._sum.allocatedNetProfit ?? new Prisma.Decimal(0);
      const alreadySettled = settledMap.get(row.investorId) ?? new Prisma.Decimal(0);
      const remaining = totalProfit.minus(alreadySettled);
      if (remaining.lte(0)) continue;

      const grossProfitAmount = remaining.mul(payoutFactor);
      if (grossProfitAmount.lte(0)) continue;

      const holdbackAmount = grossProfitAmount.mul(holdbackFactor);
      const payoutAmount = grossProfitAmount.minus(holdbackAmount);
      if (payoutAmount.lte(0)) continue;

      candidates.push({
        investorId: row.investorId,
        grossProfitAmount,
        payoutAmount,
        holdbackAmount,
      });
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "No payable investor profit is available for payout." },
        { status: 400 },
      );
    }

    const investorIds = candidates.map((item) => item.investorId);
    const created = await prisma.$transaction(async (tx) => {
      const activeInvestors = await tx.investor.findMany({
        where: { id: { in: investorIds } },
        select: {
          id: true,
          name: true,
          status: true,
          bankName: true,
          bankAccountName: true,
          bankAccountNumber: true,
          beneficiaryVerifiedAt: true,
          beneficiaryVerificationNote: true,
        },
      });
      const inactive = activeInvestors.find((item) => item.status !== "ACTIVE");
      if (inactive) {
        throw new Error("Only ACTIVE investors can receive payouts.");
      }
      const investorMap = new Map(activeInvestors.map((item) => [item.id, item]));

      const timestamp = new Date();
      const payouts: Array<{
        id: number;
        payoutNumber: string;
        investorId: number;
        payoutAmount: string;
        status: string;
      }> = [];

      for (const candidate of candidates) {
        const payoutNumber = await generateInvestorProfitPayoutNumber(tx, timestamp);
        const investor = investorMap.get(candidate.investorId);
        if (!investor) {
          throw new Error("Investor not found for payout snapshot.");
        }
        const payout = await tx.investorProfitPayout.create({
          data: {
            payoutNumber,
            runId: run.id,
            investorId: candidate.investorId,
            currency,
            payoutPercent,
            holdbackPercent,
            grossProfitAmount: candidate.grossProfitAmount,
            holdbackAmount: candidate.holdbackAmount,
            payoutAmount: candidate.payoutAmount,
            status: "PENDING_APPROVAL",
            note,
            createdById: access.userId,
            ...toPayoutSnapshotFromInvestor(investor),
          },
        });

        payouts.push({
          id: payout.id,
          payoutNumber: payout.payoutNumber,
          investorId: payout.investorId,
          payoutAmount: payout.payoutAmount.toString(),
          status: payout.status,
        });
      }

      await createInvestorInternalNotificationsForPermissions({
        tx,
        permissionKeys: ["investor_payout.approve"],
        notification: {
          type: "PAYOUT",
          title: "Investor Payout Drafts Pending Approval",
          message: `${run.runNumber} generated ${payouts.length} payout draft(s) waiting for approval.`,
          targetUrl: "/admin/investors/payouts",
          entity: "investor_profit_run",
          entityId: String(run.id),
          metadata: {
            runId: run.id,
            runNumber: run.runNumber,
            payoutCount: payouts.length,
          },
          createdById: access.userId,
        },
        excludeUserIds: access.userId ? [access.userId] : [],
      });

      return {
        createdAt: timestamp,
        payouts,
      };
    });

    await logActivity({
      action: "create",
      entity: "investor_profit_payout",
      entityId: run.id,
      access,
      request,
      metadata: {
        message: `Created payout drafts from run ${run.runNumber}`,
        payoutCount: created.payouts.length,
        payoutPercent: payoutPercent.toString(),
        holdbackPercent: holdbackPercent.toString(),
      },
    });

    return NextResponse.json({
      runId: run.id,
      runNumber: run.runNumber,
      createdAt: created.createdAt.toISOString(),
      payoutCount: created.payouts.length,
      payouts: created.payouts,
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR PAYOUT CREATE ERROR:", error);
    const message = String(error?.message || "");
    if (
      message.includes("must be") ||
      message.includes("No payable") ||
      message.includes("Run must be POSTED") ||
      message.includes("ACTIVE investors")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message || "Failed to create payout drafts." }, { status: 500 });
  }
}
