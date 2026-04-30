import { Prisma } from "@/generated/prisma";

type TransactionClient = any;

type VariantSnapshot = {
  id: number;
  productVariantId: number;
  netRevenue: Prisma.Decimal;
  netProfit: Prisma.Decimal;
  unallocatedSharePct: Prisma.Decimal;
};

type ActiveAllocationSnapshot = {
  id: number;
  investorId: number;
  productVariantId: number;
  participationPercent: Prisma.Decimal | null;
  committedAmount: Prisma.Decimal | null;
};

type AllocationInsert = {
  runId: number;
  variantLineId: number;
  investorId: number;
  productVariantId: number;
  sourceAllocationId: number | null;
  participationSharePct: Prisma.Decimal;
  allocatedRevenue: Prisma.Decimal;
  allocatedNetProfit: Prisma.Decimal;
};

function buildAllocationRows(input: {
  runId: number;
  variantLines: VariantSnapshot[];
  activeAllocations: ActiveAllocationSnapshot[];
}) {
  const allocationByVariant = new Map<number, ActiveAllocationSnapshot[]>();
  for (const allocation of input.activeAllocations) {
    const list = allocationByVariant.get(allocation.productVariantId) ?? [];
    list.push(allocation);
    allocationByVariant.set(allocation.productVariantId, list);
  }

  const allocationRows: AllocationInsert[] = [];
  const unallocatedByLineId = new Map<number, Prisma.Decimal>();

  for (const line of input.variantLines) {
    const linked = allocationByVariant.get(line.productVariantId) ?? [];
    if (linked.length === 0) {
      unallocatedByLineId.set(line.id, new Prisma.Decimal(1));
      continue;
    }

    const percentEntries = linked
      .map((item) => ({
        item,
        pct: Number(item.participationPercent?.toString() || 0) / 100,
      }))
      .filter((entry) => entry.pct > 0);

    const committedEntries = linked.filter((item) => {
      const pct = Number(item.participationPercent?.toString() || 0);
      return pct <= 0 && (item.committedAmount?.gt(0) ?? false);
    });

    let assignedShare = new Prisma.Decimal(0);

    if (percentEntries.length > 0) {
      const rawPercentTotal = percentEntries.reduce((sum, entry) => sum + entry.pct, 0);
      const normalizeFactor = rawPercentTotal > 1 ? 1 / rawPercentTotal : 1;

      for (const entry of percentEntries) {
        const share = new Prisma.Decimal(entry.pct * normalizeFactor);
        assignedShare = assignedShare.plus(share);
        allocationRows.push({
          runId: input.runId,
          variantLineId: line.id,
          investorId: entry.item.investorId,
          productVariantId: line.productVariantId,
          sourceAllocationId: entry.item.id,
          participationSharePct: share,
          allocatedRevenue: line.netRevenue.mul(share),
          allocatedNetProfit: line.netProfit.mul(share),
        });
      }
    }

    if (committedEntries.length > 0) {
      const remainingShare = new Prisma.Decimal(1).minus(assignedShare);
      const committedTotal = committedEntries.reduce(
        (sum, item) => sum.plus(item.committedAmount ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );

      if (remainingShare.gt(0) && committedTotal.gt(0)) {
        for (const entry of committedEntries) {
          const committed = entry.committedAmount ?? new Prisma.Decimal(0);
          if (committed.lte(0)) continue;

          const share = remainingShare.mul(committed.div(committedTotal));
          assignedShare = assignedShare.plus(share);
          allocationRows.push({
            runId: input.runId,
            variantLineId: line.id,
            investorId: entry.investorId,
            productVariantId: line.productVariantId,
            sourceAllocationId: entry.id,
            participationSharePct: share,
            allocatedRevenue: line.netRevenue.mul(share),
            allocatedNetProfit: line.netProfit.mul(share),
          });
        }
      }
    }

    let unallocatedSharePct = new Prisma.Decimal(1).minus(assignedShare);
    if (unallocatedSharePct.lt(0)) {
      unallocatedSharePct = new Prisma.Decimal(0);
    }
    unallocatedByLineId.set(line.id, unallocatedSharePct);
  }

  return {
    allocationRows,
    unallocatedByLineId,
  };
}

export async function ensureInvestorProfitRunAllocationSnapshots(
  tx: TransactionClient,
  runId: number,
) {
  const existingCount = await tx.investorProfitRunAllocation.count({
    where: { runId },
  });
  if (existingCount > 0) {
    return {
      repaired: false,
      createdCount: 0,
      allocationLines: await tx.investorProfitRunAllocation.findMany({
        where: { runId },
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          investorId: true,
          productVariantId: true,
          allocatedNetProfit: true,
        },
      }),
    };
  }

  const run = await tx.investorProfitRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      fromDate: true,
      toDate: true,
      variantLines: {
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          productVariantId: true,
          netRevenue: true,
          netProfit: true,
          unallocatedSharePct: true,
        },
      },
    },
  });

  if (!run) {
    throw new Error("Investor profit run not found.");
  }
  if (run.variantLines.length === 0) {
    return {
      repaired: false,
      createdCount: 0,
      allocationLines: [],
    };
  }

  const periodEndExclusive = new Date(run.toDate);
  periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);

  const activeAllocations = await tx.investorProductAllocation.findMany({
    where: {
      status: "ACTIVE",
      effectiveFrom: { lt: periodEndExclusive },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.fromDate } }],
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
    },
  });

  const { allocationRows, unallocatedByLineId } = buildAllocationRows({
    runId: run.id,
    variantLines: run.variantLines,
    activeAllocations,
  });

  for (const line of run.variantLines) {
    const nextShare = unallocatedByLineId.get(line.id) ?? new Prisma.Decimal(1);
    if (!line.unallocatedSharePct.eq(nextShare)) {
      await tx.investorProfitRunVariant.update({
        where: { id: line.id },
        data: {
          unallocatedSharePct: nextShare,
        },
      });
    }
  }

  if (allocationRows.length === 0) {
    return {
      repaired: false,
      createdCount: 0,
      allocationLines: [],
    };
  }

  const inserted = await tx.investorProfitRunAllocation.createMany({
    data: allocationRows,
  });
  if (inserted.count !== allocationRows.length) {
    throw new Error("Failed to persist the full investor profit allocation snapshot.");
  }

  return {
    repaired: true,
    createdCount: inserted.count,
    allocationLines: await tx.investorProfitRunAllocation.findMany({
      where: { runId },
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        investorId: true,
        productVariantId: true,
        allocatedNetProfit: true,
      },
    }),
  };
}
