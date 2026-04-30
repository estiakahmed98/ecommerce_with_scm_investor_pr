import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { toCleanText } from "@/lib/investor";
import { summarizeInvestorProfitRunExceptions } from "@/lib/investor-profit-governance";
import {
  createInvestorInternalNotification,
  createInvestorInternalNotificationsForPermissions,
} from "@/lib/investor-internal-notifications";

function canApproveInvestorProfit(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_profit.approve");
}

function canReadInvestorProfit(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
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

function serializeRun(run: {
  id: number;
  runNumber: string;
  status: string;
  approvedAt: Date | null;
  approvedBy?: { id: string; name: string | null; email: string } | null;
  postedAt: Date | null;
  postedBy?: { id: string; name: string | null; email: string } | null;
  updatedAt: Date;
}) {
  return {
    ...run,
    approvedAt: run.approvedAt?.toISOString() ?? null,
    postedAt: run.postedAt?.toISOString() ?? null,
    updatedAt: run.updatedAt.toISOString(),
  };
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
    if (!canReadInvestorProfit(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const runId = Number(id);
    if (!Number.isInteger(runId) || runId <= 0) {
      return NextResponse.json({ error: "Invalid profit run id." }, { status: 400 });
    }

    const run = await prisma.investorProfitRun.findUnique({
      where: { id: runId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        postedBy: { select: { id: true, name: true, email: true } },
        variantLines: {
          orderBy: [{ netProfit: "desc" }, { id: "asc" }],
          include: {
            productVariant: {
              select: {
                id: true,
                sku: true,
                product: { select: { id: true, name: true } },
              },
            },
          },
        },
        allocationLines: {
          orderBy: [{ allocatedNetProfit: "desc" }, { id: "asc" }],
          include: {
            investor: { select: { id: true, code: true, name: true, status: true } },
            productVariant: {
              select: {
                id: true,
                sku: true,
                product: { select: { id: true, name: true } },
              },
            },
            sourceAllocation: {
              select: {
                id: true,
                status: true,
                effectiveFrom: true,
                effectiveTo: true,
              },
            },
          },
        },
        payouts: {
          orderBy: [{ id: "desc" }],
          include: {
            investor: { select: { id: true, code: true, name: true } },
            transaction: {
              select: {
                id: true,
                transactionNumber: true,
                transactionDate: true,
                amount: true,
              },
            },
            createdBy: { select: { id: true, name: true, email: true } },
            approvedBy: { select: { id: true, name: true, email: true } },
            paidBy: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: {
            variantLines: true,
            allocationLines: true,
            payouts: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Investor profit run not found." }, { status: 404 });
    }

    const governance = summarizeInvestorProfitRunExceptions({
      variantLines: run.variantLines.map((line) => ({
        id: line.id,
        unallocatedSharePct: line.unallocatedSharePct,
        netRevenue: line.netRevenue,
        netProfit: line.netProfit,
      })),
      allocationLines: run.allocationLines.map((line) => ({
        id: line.id,
        allocatedNetProfit: line.allocatedNetProfit,
        sourceAllocationId: line.sourceAllocationId,
        sourceAllocation: line.sourceAllocation,
      })),
    });

    const recentActivity = await prisma.activityLog.findMany({
      where: {
        entity: "investor_profit_run",
        entityId: String(run.id),
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
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
      run: {
        ...run,
        fromDate: run.fromDate.toISOString(),
        toDate: run.toDate.toISOString(),
        marketingExpense: run.marketingExpense.toString(),
        adsExpense: run.adsExpense.toString(),
        logisticsExpense: run.logisticsExpense.toString(),
        otherExpense: run.otherExpense.toString(),
        totalOperatingExpense: run.totalOperatingExpense.toString(),
        totalNetRevenue: run.totalNetRevenue.toString(),
        totalNetCogs: run.totalNetCogs.toString(),
        totalNetProfit: run.totalNetProfit.toString(),
        approvedAt: run.approvedAt?.toISOString() ?? null,
        postedAt: run.postedAt?.toISOString() ?? null,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        variantLines: run.variantLines.map((line) => ({
          ...line,
          grossRevenue: line.grossRevenue.toString(),
          refundAmount: line.refundAmount.toString(),
          netRevenue: line.netRevenue.toString(),
          grossCogs: line.grossCogs.toString(),
          refundCogs: line.refundCogs.toString(),
          netCogs: line.netCogs.toString(),
          allocatedExpense: line.allocatedExpense.toString(),
          netProfit: line.netProfit.toString(),
          unallocatedSharePct: line.unallocatedSharePct.toString(),
          createdAt: line.createdAt.toISOString(),
          updatedAt: line.updatedAt.toISOString(),
        })),
        allocationLines: run.allocationLines.map((line) => ({
          ...line,
          participationSharePct: line.participationSharePct.toString(),
          allocatedRevenue: line.allocatedRevenue.toString(),
          allocatedNetProfit: line.allocatedNetProfit.toString(),
          createdAt: line.createdAt.toISOString(),
          updatedAt: line.updatedAt.toISOString(),
          sourceAllocation: line.sourceAllocation
            ? {
                ...line.sourceAllocation,
                effectiveFrom: line.sourceAllocation.effectiveFrom.toISOString(),
                effectiveTo: line.sourceAllocation.effectiveTo?.toISOString() ?? null,
              }
            : null,
        })),
        payouts: run.payouts.map((item) => ({
          ...item,
          payoutPercent: item.payoutPercent.toString(),
          holdbackPercent: item.holdbackPercent.toString(),
          grossProfitAmount: item.grossProfitAmount.toString(),
          holdbackAmount: item.holdbackAmount.toString(),
          payoutAmount: item.payoutAmount.toString(),
          approvedAt: item.approvedAt?.toISOString() ?? null,
          rejectedAt: item.rejectedAt?.toISOString() ?? null,
          paidAt: item.paidAt?.toISOString() ?? null,
          voidedAt: item.voidedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
          transaction: item.transaction
            ? {
                ...item.transaction,
                amount: item.transaction.amount.toString(),
                transactionDate: item.transaction.transactionDate.toISOString(),
              }
            : null,
        })),
      },
      governance,
      recentActivity: recentActivity.map((item) => ({
        id: item.id.toString(),
        action: item.action,
        entity: item.entity,
        entityId: item.entityId,
        createdAt: item.createdAt.toISOString(),
        actorName: item.user?.name ?? null,
        actorEmail: item.user?.email ?? null,
        metadata: item.metadata as { message?: string } | null,
      })),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR PROFIT RUN GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor profit run detail." },
      { status: 500 },
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
    if (!canApproveInvestorProfit(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const runId = Number(id);
    if (!Number.isInteger(runId) || runId <= 0) {
      return NextResponse.json({ error: "Invalid profit run id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use approve or reject." }, { status: 400 });
    }
    const note = toCleanText(body.note, 500) || null;

    const existing = await prisma.investorProfitRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        runNumber: true,
        status: true,
        createdById: true,
        approvedAt: true,
        postedAt: true,
        postingNote: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Investor profit run not found." }, { status: 404 });
    }
    if (existing.status === "POSTED") {
      return NextResponse.json(
        { error: "Posted run cannot be approved or rejected." },
        { status: 400 },
      );
    }
    if (action === "approve" && existing.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: "Only PENDING_APPROVAL runs can be approved." },
        { status: 400 },
      );
    }
    if (action === "reject" && existing.status !== "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: "Only PENDING_APPROVAL runs can be rejected." },
        { status: 400 },
      );
    }
    if (action === "reject" && !note) {
      return NextResponse.json(
        { error: "Rejection note is required for investor profit run rejection." },
        { status: 400 },
      );
    }
    if (existing.createdById && existing.createdById === access.userId) {
      return NextResponse.json(
        { error: "Maker-checker policy: creator cannot approve/reject own profit run." },
        { status: 403 },
      );
    }

    if (action === "approve") {
      const [variantLines, allocationLines] = await Promise.all([
        prisma.investorProfitRunVariant.findMany({
          where: { runId },
          select: {
            id: true,
            unallocatedSharePct: true,
            netRevenue: true,
            netProfit: true,
          },
        }),
        prisma.investorProfitRunAllocation.findMany({
          where: { runId },
          select: {
            id: true,
            allocatedNetProfit: true,
            sourceAllocationId: true,
          },
        }),
      ]);
      const governance = summarizeInvestorProfitRunExceptions({
        variantLines,
        allocationLines,
      });
      if (governance.blockingIssues.length > 0) {
        return NextResponse.json(
          {
            error: `Run cannot be approved: ${governance.blockingIssues.join(" ")}`,
          },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.investorProfitRun.update({
        where: { id: runId },
        data: {
          status: action === "approve" ? "APPROVED" : "REJECTED",
          approvedById: access.userId,
          approvedAt: now,
          ...(action === "reject" ? { postingNote: note ?? "Rejected in approval step." } : {}),
        },
        include: {
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
          postedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (action === "approve") {
        await createInvestorInternalNotificationsForPermissions({
          tx,
          permissionKeys: ["investor_profit.post"],
          notification: {
            type: "PROFIT_RUN",
            title: "Investor Profit Run Ready To Post",
            message: `${next.runNumber} was approved and is ready for posting to investor ledger.`,
            targetUrl: `/admin/investors/profit-runs/${next.id}`,
            entity: "investor_profit_run",
            entityId: String(next.id),
            metadata: {
              runId: next.id,
              runNumber: next.runNumber,
              status: next.status,
            },
            createdById: access.userId,
          },
          excludeUserIds: access.userId ? [access.userId] : [],
        });
      } else if (existing.createdById && existing.createdById !== access.userId) {
        await createInvestorInternalNotification({
          tx,
          notification: {
            userId: existing.createdById,
            type: "PROFIT_RUN",
            title: "Investor Profit Run Rejected",
            message: `${next.runNumber} was rejected.${note ? ` Note: ${note}` : ""}`,
            targetUrl: `/admin/investors/profit-runs/${next.id}`,
            entity: "investor_profit_run",
            entityId: String(next.id),
            metadata: {
              runId: next.id,
              runNumber: next.runNumber,
              status: next.status,
            },
            createdById: access.userId,
          },
        });
      }

      return next;
    });

    await logActivity({
      action: action === "approve" ? "approve" : "reject",
      entity: "investor_profit_run",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message:
          action === "approve"
            ? `Approved investor profit run ${updated.runNumber}`
            : `Rejected investor profit run ${updated.runNumber}`,
        note,
      },
      before: {
        status: existing.status,
        approvedAt: existing.approvedAt?.toISOString() ?? null,
      },
      after: {
        status: updated.status,
        approvedAt: updated.approvedAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json({
      run: serializeRun(updated),
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR PROFIT RUN PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update investor profit run." },
      { status: 500 },
    );
  }
}
