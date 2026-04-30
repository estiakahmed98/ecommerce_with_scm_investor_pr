import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateInvestorProfitRunNumber,
  parseInvestorProfitAllocationBasis,
  toCleanText,
  toDecimalAmount,
} from "@/lib/investor";
import { createInvestorInternalNotificationsForPermissions } from "@/lib/investor-internal-notifications";

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

function canManageInvestorProfit(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_profit.manage");
}

function asDecimal(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

type VariantAccumulator = {
  variantId: number;
  sku: string;
  productName: string;
  unitsSold: number;
  unitsRefunded: number;
  grossRevenue: Prisma.Decimal;
  refundAmount: Prisma.Decimal;
  grossCogs: Prisma.Decimal;
  refundCogs: Prisma.Decimal;
  netRevenue: Prisma.Decimal;
  netCogs: Prisma.Decimal;
  allocatedExpense: Prisma.Decimal;
  netProfit: Prisma.Decimal;
  unallocatedSharePct: Prisma.Decimal;
};

function serializeRun(run: {
  id: number;
  runNumber: string;
  fromDate: Date;
  toDate: Date;
  status: string;
  allocationBasis: string;
  marketingExpense: Prisma.Decimal;
  adsExpense: Prisma.Decimal;
  logisticsExpense: Prisma.Decimal;
  otherExpense: Prisma.Decimal;
  totalOperatingExpense: Prisma.Decimal;
  totalNetRevenue: Prisma.Decimal;
  totalNetCogs: Prisma.Decimal;
  totalNetProfit: Prisma.Decimal;
  note: string | null;
  approvedAt: Date | null;
  postedAt: Date | null;
  postingNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  approvedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  postedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  _count?: {
    variantLines: number;
    allocationLines: number;
    payouts: number;
  };
}) {
  return {
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
    if (!canReadInvestorProfit(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const runId = Number(request.nextUrl.searchParams.get("runId") || "");
    const investorId = Number(request.nextUrl.searchParams.get("investorId") || "");

    const runs = await prisma.investorProfitRun.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 24,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        postedBy: {
          select: {
            id: true,
            name: true,
            email: true,
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

    const selectedRunId =
      Number.isInteger(runId) && runId > 0
        ? runId
        : runs.length > 0
          ? runs[0].id
          : null;

    if (!selectedRunId) {
      return NextResponse.json({
        runs: [],
        selectedRunId: null,
        variantLines: [],
        allocationLines: [],
        payouts: [],
      });
    }

    const [variantLines, allocationLines, payouts] = await Promise.all([
      prisma.investorProfitRunVariant.findMany({
        where: { runId: selectedRunId },
        orderBy: [{ netProfit: "desc" }, { id: "asc" }],
        include: {
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
        },
      }),
      prisma.investorProfitRunAllocation.findMany({
        where: {
          runId: selectedRunId,
          ...(Number.isInteger(investorId) && investorId > 0 ? { investorId } : {}),
        },
        orderBy: [{ allocatedNetProfit: "desc" }, { id: "asc" }],
        include: {
          investor: {
            select: {
              id: true,
              code: true,
              name: true,
            },
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
          sourceAllocation: {
            select: {
              id: true,
              status: true,
              effectiveFrom: true,
              effectiveTo: true,
            },
          },
        },
      }),
      prisma.investorProfitPayout.findMany({
        where: {
          runId: selectedRunId,
          ...(Number.isInteger(investorId) && investorId > 0 ? { investorId } : {}),
        },
        orderBy: [{ id: "desc" }],
        include: {
          investor: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          transaction: {
            select: {
              id: true,
              transactionNumber: true,
              transactionDate: true,
              type: true,
              direction: true,
              amount: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          rejectedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          paidBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          voidedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      runs: runs.map((run) => serializeRun(run)),
      selectedRunId,
      variantLines: variantLines.map((line) => ({
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
      allocationLines: allocationLines.map((line) => ({
        ...line,
        participationSharePct: line.participationSharePct.toString(),
        allocatedRevenue: line.allocatedRevenue.toString(),
        allocatedNetProfit: line.allocatedNetProfit.toString(),
        createdAt: line.createdAt.toISOString(),
        updatedAt: line.updatedAt.toISOString(),
        sourceAllocation: line.sourceAllocation
          ? {
              ...line.sourceAllocation,
              effectiveFrom: toIso(line.sourceAllocation.effectiveFrom),
              effectiveTo: toIso(line.sourceAllocation.effectiveTo),
            }
          : null,
      })),
      payouts: payouts.map((item) => ({
        ...item,
        payoutPercent: item.payoutPercent.toString(),
        holdbackPercent: item.holdbackPercent.toString(),
        grossProfitAmount: item.grossProfitAmount.toString(),
        holdbackAmount: item.holdbackAmount.toString(),
        payoutAmount: item.payoutAmount.toString(),
        approvedAt: toIso(item.approvedAt),
        rejectedAt: toIso(item.rejectedAt),
        paidAt: toIso(item.paidAt),
        voidedAt: toIso(item.voidedAt),
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
    });
  } catch (error) {
    console.error("ADMIN INVESTOR PROFIT RUNS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor profit runs." }, { status: 500 });
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
    if (!canManageInvestorProfit(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fromDate = body.fromDate ? new Date(String(body.fromDate)) : null;
    const toDate = body.toDate ? new Date(String(body.toDate)) : null;
    if (!fromDate || !toDate || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: "Valid from/to dates are required." },
        { status: 400 },
      );
    }
    if (fromDate > toDate) {
      return NextResponse.json(
        { error: "From date must be earlier than or equal to to-date." },
        { status: 400 },
      );
    }

    const allocationBasis = parseInvestorProfitAllocationBasis(body.allocationBasis);
    const marketingExpense = toDecimalAmount(body.marketingExpense ?? 0, "Marketing expense");
    const adsExpense = toDecimalAmount(body.adsExpense ?? 0, "Ads expense");
    const logisticsExpense = toDecimalAmount(body.logisticsExpense ?? 0, "Logistics expense");
    const otherExpense = toDecimalAmount(body.otherExpense ?? 0, "Other expense");
    const totalOperatingExpense = marketingExpense
      .plus(adsExpense)
      .plus(logisticsExpense)
      .plus(otherExpense);
    const note = toCleanText(body.note, 500) || null;

    const periodEndExclusive = new Date(toDate);
    periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);

    const [orderItems, refunds, activeAllocations] = await Promise.all([
      prisma.orderItem.findMany({
        where: {
          variantId: { not: null },
          order: {
            order_date: {
              gte: fromDate,
              lt: periodEndExclusive,
            },
            status: {
              in: ["DELIVERED", "RETURNED"],
            },
          },
        },
        select: {
          id: true,
          variantId: true,
          quantity: true,
          price: true,
          discountAmount: true,
          costPriceSnapshot: true,
          variant: {
            select: {
              id: true,
              sku: true,
              costPrice: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.refund.findMany({
        where: {
          createdAt: {
            gte: fromDate,
            lt: periodEndExclusive,
          },
          status: {
            in: ["APPROVED", "COMPLETED"],
          },
          orderItemId: { not: null },
          orderItem: {
            variantId: { not: null },
          },
        },
        select: {
          id: true,
          amount: true,
          quantity: true,
          orderItem: {
            select: {
              variantId: true,
              quantity: true,
              costPriceSnapshot: true,
              variant: {
                select: {
                  costPrice: true,
                },
              },
            },
          },
        },
      }),
      prisma.investorProductAllocation.findMany({
        where: {
          status: "ACTIVE",
          // Use end-exclusive period boundary so allocations created anytime on `toDate`
          // are included in the same profitability run window.
          effectiveFrom: { lt: periodEndExclusive },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: fromDate } }],
          investor: {
            status: "ACTIVE",
          },
        },
        select: {
          id: true,
          investorId: true,
          productVariantId: true,
          participationPercent: true,
          committedAmount: true,
          investor: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      }),
    ]);

    if (orderItems.length === 0 && refunds.length === 0) {
      return NextResponse.json(
        { error: "No eligible delivered/returned sales or approved refunds found in selected period." },
        { status: 400 },
      );
    }

    const accumulator = new Map<number, VariantAccumulator>();

    const ensureVariant = (input: {
      variantId: number;
      sku: string;
      productName: string;
    }) => {
      if (!accumulator.has(input.variantId)) {
        accumulator.set(input.variantId, {
          variantId: input.variantId,
          sku: input.sku,
          productName: input.productName,
          unitsSold: 0,
          unitsRefunded: 0,
          grossRevenue: new Prisma.Decimal(0),
          refundAmount: new Prisma.Decimal(0),
          grossCogs: new Prisma.Decimal(0),
          refundCogs: new Prisma.Decimal(0),
          netRevenue: new Prisma.Decimal(0),
          netCogs: new Prisma.Decimal(0),
          allocatedExpense: new Prisma.Decimal(0),
          netProfit: new Prisma.Decimal(0),
          unallocatedSharePct: new Prisma.Decimal(0),
        });
      }
      return accumulator.get(input.variantId)!;
    };

    for (const item of orderItems) {
      const variantId = item.variantId ?? item.variant?.id ?? null;
      if (!variantId) continue;
      const row = ensureVariant({
        variantId,
        sku: item.variant?.sku || `VAR-${variantId}`,
        productName: item.variant?.product?.name || `Variant ${variantId}`,
      });

      const quantity = Math.max(0, Number(item.quantity) || 0);
      const unitPrice = asDecimal(item.price);
      const discountAmount = asDecimal(item.discountAmount);
      const grossRevenue = unitPrice.mul(quantity).minus(discountAmount);
      const unitCost = item.costPriceSnapshot ?? item.variant?.costPrice ?? new Prisma.Decimal(0);
      const grossCogs = asDecimal(unitCost).mul(quantity);

      row.unitsSold += quantity;
      row.grossRevenue = row.grossRevenue.plus(grossRevenue);
      row.grossCogs = row.grossCogs.plus(grossCogs);
    }

    for (const refund of refunds) {
      const variantId = refund.orderItem?.variantId ?? null;
      if (!variantId) continue;
      const row = ensureVariant({
        variantId,
        sku: `VAR-${variantId}`,
        productName: `Variant ${variantId}`,
      });

      const refundedQty = Math.max(
        0,
        Number(refund.quantity) || Number(refund.orderItem?.quantity) || 0,
      );
      const refundAmount = asDecimal(refund.amount);
      const unitCost =
        refund.orderItem?.costPriceSnapshot ??
        refund.orderItem?.variant?.costPrice ??
        new Prisma.Decimal(0);
      const refundCogs = asDecimal(unitCost).mul(refundedQty);

      row.unitsRefunded += refundedQty;
      row.refundAmount = row.refundAmount.plus(refundAmount);
      row.refundCogs = row.refundCogs.plus(refundCogs);
    }

    const variants = [...accumulator.values()].sort((left, right) => left.variantId - right.variantId);
    for (const row of variants) {
      row.netRevenue = row.grossRevenue.minus(row.refundAmount);
      row.netCogs = row.grossCogs.minus(row.refundCogs);
    }

    const weights = variants.map((row) => {
      if (allocationBasis === "NET_UNITS") {
        return Math.max(0, row.unitsSold - row.unitsRefunded);
      }
      return Math.max(0, Number(row.netRevenue.toString()));
    });

    let denominator = weights.reduce((sum, value) => sum + value, 0);
    if (denominator <= 0) {
      for (let index = 0; index < weights.length; index += 1) {
        weights[index] = 1;
      }
      denominator = weights.length;
    }

    let expenseAllocated = new Prisma.Decimal(0);
    for (let index = 0; index < variants.length; index += 1) {
      const row = variants[index];
      const isLast = index === variants.length - 1;
      const ratio = denominator > 0 ? weights[index] / denominator : 0;
      const allocatedExpense = isLast
        ? totalOperatingExpense.minus(expenseAllocated)
        : totalOperatingExpense.mul(ratio);
      expenseAllocated = expenseAllocated.plus(allocatedExpense);
      row.allocatedExpense = allocatedExpense;
      row.netProfit = row.netRevenue.minus(row.netCogs).minus(row.allocatedExpense);
    }

    const allocationByVariant = new Map<number, typeof activeAllocations>();
    for (const allocation of activeAllocations) {
      const list = allocationByVariant.get(allocation.productVariantId) ?? [];
      list.push(allocation);
      allocationByVariant.set(allocation.productVariantId, list);
    }

    type AllocationCandidate = {
      variantId: number;
      investorId: number;
      sourceAllocationId: number | null;
      share: Prisma.Decimal;
      allocatedRevenue: Prisma.Decimal;
      allocatedNetProfit: Prisma.Decimal;
    };

    const allocationCandidates: AllocationCandidate[] = [];
    console.log("DEBUG: Processing allocations for profit run", {
      totalVariants: variants.length,
      totalActiveAllocations: activeAllocations.length,
      allocationByVariantCount: allocationByVariant.size,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
    });

    for (const row of variants) {
      const linked = allocationByVariant.get(row.variantId) ?? [];
      console.log(`DEBUG: Variant ${row.variantId} (${row.sku}) has ${linked.length} allocations`, {
        variantId: row.variantId,
        sku: row.sku,
        netProfit: row.netProfit.toString(),
        allocations: linked.map((a: typeof activeAllocations[0]) => ({
          id: a.id,
          investorId: a.investorId,
          participationPercent: a.participationPercent?.toString(),
          committedAmount: a.committedAmount?.toString(),
        })),
      });
      
      if (linked.length === 0) {
        row.unallocatedSharePct = new Prisma.Decimal(1);
        continue;
      }

      // Separate percentage-based and committed amount allocations
      const percentEntries = linked
        .map((item) => ({
          item,
          pct: Number(item.participationPercent?.toString() || 0) / 100,
        }))
        .filter((entry: any) => entry.pct > 0);

      const committedEntries = linked.filter((item) => {
        const pct = Number(item.participationPercent?.toString() || 0);
        return pct <= 0 && (item.committedAmount?.gt(0) ?? false);
      });

      let assignedShare = new Prisma.Decimal(0);

      // Process percentage-based allocations first
      if (percentEntries.length > 0) {
        const rawPercentTotal = percentEntries.reduce((sum, entry) => sum + entry.pct, 0);
        const normalizeFactor = rawPercentTotal > 1 ? 1 / rawPercentTotal : 1;

        for (const entry of percentEntries) {
          const share = new Prisma.Decimal(entry.pct * normalizeFactor);
          assignedShare = assignedShare.plus(share);
          allocationCandidates.push({
            variantId: row.variantId,
            investorId: entry.item.investorId,
            sourceAllocationId: entry.item.id,
            share,
            allocatedRevenue: row.netRevenue.mul(share),
            allocatedNetProfit: row.netProfit.mul(share),
          });
        }
      }

      // Process committed amount allocations with remaining share
      if (committedEntries.length > 0) {
        const remainingShare = new Prisma.Decimal(1).minus(assignedShare);
        const committedTotal = committedEntries.reduce(
          (sum, item) => sum.plus(item.committedAmount ?? new Prisma.Decimal(0)),
          new Prisma.Decimal(0),
        );

        if (remainingShare.gt(0) && committedTotal.gt(0)) {
          for (const entry of committedEntries) {
            const committed = entry.committedAmount ?? new Prisma.Decimal(0);
            if (committed.gt(0)) {
              const share = remainingShare.mul(committed.div(committedTotal));
              assignedShare = assignedShare.plus(share);
              allocationCandidates.push({
                variantId: row.variantId,
                investorId: entry.investorId,
                sourceAllocationId: entry.id,
                share,
                allocatedRevenue: row.netRevenue.mul(share),
                allocatedNetProfit: row.netProfit.mul(share),
              });
            }
          }
        }
      }

      // Calculate unallocated share (should be 0 if allocations cover everything)
      row.unallocatedSharePct = new Prisma.Decimal(1).minus(assignedShare);
      if (row.unallocatedSharePct.lt(0)) {
        row.unallocatedSharePct = new Prisma.Decimal(0);
      }
      
      console.log(`DEBUG: Final allocation for variant ${row.variantId}`, {
        unallocatedSharePct: row.unallocatedSharePct.toString(),
        assignedShare: assignedShare.toString(),
        totalCandidates: allocationCandidates.filter(c => c.variantId === row.variantId).length,
      });
    }
    
    console.log("DEBUG: Final allocation candidates summary", {
      totalCandidates: allocationCandidates.length,
      candidatesByVariant: allocationCandidates.reduce((acc, candidate) => {
        acc[candidate.variantId] = (acc[candidate.variantId] || 0) + 1;
        return acc;
      }, {} as Record<number, number>),
    });

    const totalNetRevenue = variants.reduce(
      (sum, item) => sum.plus(item.netRevenue),
      new Prisma.Decimal(0),
    );
    const totalNetCogs = variants.reduce(
      (sum, item) => sum.plus(item.netCogs),
      new Prisma.Decimal(0),
    );
    const totalNetProfit = variants.reduce(
      (sum, item) => sum.plus(item.netProfit),
      new Prisma.Decimal(0),
    );

    const created = await prisma.$transaction(async (tx) => {
      const runNumber = await generateInvestorProfitRunNumber(tx);
      const run = await tx.investorProfitRun.create({
        data: {
          runNumber,
          fromDate,
          toDate,
          status: "PENDING_APPROVAL",
          allocationBasis,
          marketingExpense,
          adsExpense,
          logisticsExpense,
          otherExpense,
          totalOperatingExpense,
          totalNetRevenue,
          totalNetCogs,
          totalNetProfit,
          note,
          approvedAt: null,
          postedAt: null,
          postingNote: null,
          createdById: access.userId,
        },
      });

      const variantIdToLineId = new Map<number, number>();
      for (const line of variants) {
        const createdLine = await tx.investorProfitRunVariant.create({
          data: {
            runId: run.id,
            productVariantId: line.variantId,
            unitsSold: line.unitsSold,
            unitsRefunded: line.unitsRefunded,
            unitsNet: line.unitsSold - line.unitsRefunded,
            grossRevenue: line.grossRevenue,
            refundAmount: line.refundAmount,
            netRevenue: line.netRevenue,
            grossCogs: line.grossCogs,
            refundCogs: line.refundCogs,
            netCogs: line.netCogs,
            allocatedExpense: line.allocatedExpense,
            netProfit: line.netProfit,
            unallocatedSharePct: line.unallocatedSharePct,
          },
        });
        variantIdToLineId.set(line.variantId, createdLine.id);
      }

      if (allocationCandidates.length > 0) {
        const allocationRows = allocationCandidates
          .map((item) => {
            const variantLineId = variantIdToLineId.get(item.variantId);
            if (!variantLineId) return null;
            return {
              runId: run.id,
              variantLineId,
              investorId: item.investorId,
              productVariantId: item.variantId,
              sourceAllocationId: item.sourceAllocationId,
              participationSharePct: item.share,
              allocatedRevenue: item.allocatedRevenue,
              allocatedNetProfit: item.allocatedNetProfit,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        if (allocationRows.length !== allocationCandidates.length) {
          throw new Error("Failed to map all investor profit allocations to variant lines.");
        }

        const insertedAllocations = await tx.investorProfitRunAllocation.createMany({
          data: allocationRows,
        });
        if (insertedAllocations.count !== allocationRows.length) {
          throw new Error("Failed to persist the full investor profit allocation snapshot.");
        }
      }

      const [variantCount, allocationCount] = await Promise.all([
        tx.investorProfitRunVariant.count({ where: { runId: run.id } }),
        tx.investorProfitRunAllocation.count({ where: { runId: run.id } }),
      ]);

      await createInvestorInternalNotificationsForPermissions({
        tx,
        permissionKeys: ["investor_profit.approve"],
        notification: {
          type: "PROFIT_RUN",
          title: "Investor Profit Run Pending Approval",
          message: `${run.runNumber} was generated and is waiting for approval.`,
          targetUrl: `/admin/investors/profit-runs/${run.id}`,
          entity: "investor_profit_run",
          entityId: String(run.id),
          metadata: {
            runId: run.id,
            runNumber: run.runNumber,
            status: run.status,
          },
          createdById: access.userId,
        },
        excludeUserIds: access.userId ? [access.userId] : [],
      });

      return {
        run,
        variantCount,
        allocationCount,
      };
    });

    await logActivity({
      action: "create",
      entity: "investor_profit_run",
      entityId: created.run.id,
      access,
      request,
      metadata: {
        message: `Generated investor profit run ${created.run.runNumber}`,
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        variantCount: created.variantCount,
        allocationCount: created.allocationCount,
      },
      after: {
        runNumber: created.run.runNumber,
        totalNetRevenue: created.run.totalNetRevenue.toString(),
        totalNetCogs: created.run.totalNetCogs.toString(),
        totalOperatingExpense: created.run.totalOperatingExpense.toString(),
        totalNetProfit: created.run.totalNetProfit.toString(),
      },
    });

    return NextResponse.json(
      {
        run: serializeRun(created.run),
        variantCount: created.variantCount,
        allocationCount: created.allocationCount,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("ADMIN INVESTOR PROFIT RUNS POST ERROR:", error);
    const message = String(error?.message || "");
    if (message.includes("required") || message.includes("No eligible")) {
      return NextResponse.json({ error: message || "Invalid request." }, { status: 400 });
    }
    return NextResponse.json(
      { error: message || "Failed to generate investor profit run." },
      { status: 500 },
    );
  }
}
