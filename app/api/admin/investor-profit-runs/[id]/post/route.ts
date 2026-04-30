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
  toCleanText,
} from "@/lib/investor";
import { ensureInvestorProfitRunAllocationSnapshots } from "@/lib/investor-profit-run";
import { summarizeInvestorProfitRunExceptions } from "@/lib/investor-profit-governance";
import { createInvestorInternalNotificationsForPermissions } from "@/lib/investor-internal-notifications";

function canPostInvestorProfit(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_profit.post");
}

type PostingEntry = {
  investorId: number;
  productVariantId: number | null;
  direction: "CREDIT" | "DEBIT";
  type: "PROFIT_ALLOCATION" | "LOSS_ALLOCATION";
  amount: Prisma.Decimal;
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
    if (!canPostInvestorProfit(access)) {
      return NextResponse.json(
        {
          error:
            "Forbidden: missing global permission 'investor_profit.post'. Assign this permission globally and sign in again.",
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const runId = Number(id);
    if (!Number.isInteger(runId) || runId <= 0) {
      return NextResponse.json({ error: "Invalid profit run id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const postingNote = toCleanText(body.note, 500) || null;
    if (!postingNote) {
      return NextResponse.json(
        { error: "Posting note is required before posting investor profit run to ledger." },
        { status: 400 },
      );
    }

    const run = await prisma.investorProfitRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        runNumber: true,
        status: true,
        postedAt: true,
      },
    });
    if (!run) {
      return NextResponse.json({ error: "Investor profit run not found." }, { status: 404 });
    }
    if (run.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Only APPROVED runs can be posted to investor ledger." },
        { status: 400 },
      );
    }
    if (run.postedAt) {
      return NextResponse.json(
        { error: "This run is already posted." },
        { status: 409 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const snapshot = await ensureInvestorProfitRunAllocationSnapshots(tx, run.id);
      const variantLines = await tx.investorProfitRunVariant.findMany({
        where: { runId: run.id },
        select: {
          id: true,
          unallocatedSharePct: true,
          netRevenue: true,
          netProfit: true,
        },
      });
      const allocationDetails = await tx.investorProfitRunAllocation.findMany({
        where: { runId: run.id },
        select: {
          id: true,
          allocatedNetProfit: true,
          sourceAllocationId: true,
          sourceAllocation: {
            select: { status: true },
          },
        },
      });
      const governance = summarizeInvestorProfitRunExceptions({
        variantLines,
        allocationLines: allocationDetails,
      });
      if (governance.blockingIssues.length > 0) {
        throw new Error(
          `Run cannot be posted: ${governance.blockingIssues.join(" ")}`,
        );
      }
      const map = new Map<string, PostingEntry>();
      for (const line of snapshot.allocationLines) {
        if (line.allocatedNetProfit.eq(0)) continue;
        const direction: PostingEntry["direction"] =
          line.allocatedNetProfit.gte(0) ? "CREDIT" : "DEBIT";
        const type: PostingEntry["type"] = line.allocatedNetProfit.gte(0)
          ? "PROFIT_ALLOCATION"
          : "LOSS_ALLOCATION";
        const amount = line.allocatedNetProfit.abs();
        if (amount.lte(0)) continue;

        const key = `${line.investorId}:${line.productVariantId ?? "pool"}:${direction}:${type}`;
        const existing = map.get(key);
        if (existing) {
          existing.amount = existing.amount.plus(amount);
        } else {
          map.set(key, {
            investorId: line.investorId,
            productVariantId: line.productVariantId ?? null,
            direction,
            type,
            amount,
          });
        }
      }

      const entries = [...map.values()];
      if (entries.length === 0) {
        throw new Error("No investor profit/loss amount is available to post.");
      }

      const investorIds = [...new Set(entries.map((entry) => entry.investorId))];
      const activeInvestors = await tx.investor.findMany({
        where: { id: { in: investorIds } },
        select: { id: true, status: true },
      });
      const inactive = activeInvestors.find((item) => item.status !== "ACTIVE");
      if (inactive) {
        throw new Error("Only ACTIVE investors can receive posted run transactions.");
      }

      const ledgerGroups = await tx.investorCapitalTransaction.groupBy({
        by: ["investorId", "direction"],
        where: { investorId: { in: investorIds } },
        _sum: {
          amount: true,
        },
      });
      const requiredByInvestor = new Map<number, { credit: Prisma.Decimal; debit: Prisma.Decimal }>();
      for (const id of investorIds) {
        requiredByInvestor.set(id, {
          credit: new Prisma.Decimal(0),
          debit: new Prisma.Decimal(0),
        });
      }
      for (const entry of entries) {
        const current = requiredByInvestor.get(entry.investorId)!;
        if (entry.direction === "CREDIT") {
          current.credit = current.credit.plus(entry.amount);
        } else {
          current.debit = current.debit.plus(entry.amount);
        }
      }

      for (const investorId of investorIds) {
        const totals = computeInvestorLedgerTotals(
          ledgerGroups
            .filter((item) => item.investorId === investorId)
            .map((item) => ({
              direction: item.direction,
              amount: item._sum.amount ?? new Prisma.Decimal(0),
            })),
        );
        const required = requiredByInvestor.get(investorId)!;
        const availableWithCredits = totals.balance.plus(required.credit);
        if (required.debit.gt(availableWithCredits)) {
          throw new Error(
            `Posted losses exceed available investor balance for investor #${investorId}.`,
          );
        }
      }

      const transactionDate = new Date();
      const createdTransactions: Array<{
        id: number;
        transactionNumber: string;
        investorId: number;
        direction: "CREDIT" | "DEBIT";
        type: string;
        amount: string;
      }> = [];

      for (const entry of entries) {
        const transactionNumber = await generateInvestorTransactionNumber(tx, transactionDate);
        const inserted = await tx.investorCapitalTransaction.create({
          data: {
            transactionNumber,
            investorId: entry.investorId,
            transactionDate,
            type: entry.type,
            direction: entry.direction,
            amount: entry.amount,
            currency: "BDT",
            note: postingNote || `Posted from investor profit run ${run.runNumber}.`,
            referenceType: "INVESTOR_PROFIT_RUN_POST",
            referenceNumber: run.runNumber,
            productVariantId: entry.productVariantId,
            createdById: access.userId,
          },
        });
        createdTransactions.push({
          id: inserted.id,
          transactionNumber: inserted.transactionNumber,
          investorId: inserted.investorId,
          direction: inserted.direction,
          type: inserted.type,
          amount: inserted.amount.toString(),
        });
      }

      const updatedRun = await tx.investorProfitRun.update({
        where: { id: run.id },
        data: {
          status: "POSTED",
          postedById: access.userId,
          postedAt: transactionDate,
          postingNote,
        },
        select: {
          id: true,
          runNumber: true,
          status: true,
          postedAt: true,
          postedById: true,
        },
      });

      await createInvestorInternalNotificationsForPermissions({
        tx,
        permissionKeys: ["investor_payout.manage"],
        notification: {
          type: "PROFIT_RUN",
          title: "Investor Profit Run Posted",
          message: `${updatedRun.runNumber} was posted and is ready for payout draft creation.`,
          targetUrl: `/admin/investors/profit-runs/${updatedRun.id}`,
          entity: "investor_profit_run",
          entityId: String(updatedRun.id),
          metadata: {
            runId: updatedRun.id,
            runNumber: updatedRun.runNumber,
            status: updatedRun.status,
          },
          createdById: access.userId,
        },
        excludeUserIds: access.userId ? [access.userId] : [],
      });

      return {
        updatedRun,
        transactions: createdTransactions,
        repairedAllocationCount: snapshot.createdCount,
      };
    });

    await logActivity({
      action: "post",
      entity: "investor_profit_run",
      entityId: run.id,
      access,
      request,
      metadata: {
        message: `Posted investor profit run ${run.runNumber} into ledger`,
        postedTransactionCount: created.transactions.length,
        repairedAllocationCount: created.repairedAllocationCount,
      },
      before: {
        status: run.status,
      },
      after: {
        status: created.updatedRun.status,
        postedAt: created.updatedRun.postedAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json({
      run: {
        ...created.updatedRun,
        postedAt: created.updatedRun.postedAt?.toISOString() ?? null,
      },
      postedTransactionCount: created.transactions.length,
      repairedAllocationCount: created.repairedAllocationCount,
      transactions: created.transactions,
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR PROFIT RUN POSTING ERROR:", error);
    const message = String(error?.message || "");
    if (
      message.includes("Only APPROVED") ||
      message.includes("already posted") ||
      message.includes("available") ||
      message.includes("No investor profit/loss") ||
      message.includes("ACTIVE investors")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message || "Failed to post investor profit run." }, { status: 500 });
  }
}
