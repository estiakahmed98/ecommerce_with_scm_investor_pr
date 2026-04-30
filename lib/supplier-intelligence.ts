import { Prisma } from "@/generated/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return roundToOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return roundToOne((numerator / denominator) * 100);
}

function percentile(values: number[], percentileRank: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const normalizedRank = Math.min(1, Math.max(0, percentileRank));
  const index = Math.max(0, Math.ceil(sorted.length * normalizedRank) - 1);
  return sorted[index] ?? null;
}

function diffDays(start: Date, end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function getPerformanceBand(
  trackedPoCount: number,
  onTimeRatePercent: number | null,
  openLatePoCount: number,
  averageDelayDays: number | null,
) {
  if (trackedPoCount < 2) return "INSUFFICIENT_DATA" as const;
  if ((onTimeRatePercent ?? 100) >= 90 && openLatePoCount === 0 && (averageDelayDays ?? 0) <= 1) {
    return "STABLE" as const;
  }
  if ((onTimeRatePercent ?? 0) >= 70 && openLatePoCount <= 2) {
    return "WATCH" as const;
  }
  return "AT_RISK" as const;
}

export const supplierLeadTimeInclude = Prisma.validator<Prisma.SupplierInclude>()({
  purchaseOrders: {
    where: {
      status: {
        notIn: ["DRAFT", "CANCELLED"],
      },
    },
    orderBy: [{ orderDate: "desc" }, { id: "desc" }],
    include: {
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      items: {
        select: {
          quantityOrdered: true,
          quantityReceived: true,
        },
      },
      goodsReceipts: {
        select: {
          id: true,
          receiptNumber: true,
          receivedAt: true,
          status: true,
        },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      },
    },
  },
});

export type SupplierLeadTimeRecord = Prisma.SupplierGetPayload<{
  include: typeof supplierLeadTimeInclude;
}>;

export type SupplierLeadTimeOrderDetail = {
  id: number;
  poNumber: string;
  warehouse: {
    id: number;
    name: string;
    code: string;
  };
  status: string;
  orderDate: string;
  anchorDate: string;
  expectedAt: string | null;
  benchmarkDueAt: string | null;
  firstReceiptAt: string | null;
  finalReceiptAt: string | null;
  configuredLeadTimeDays: number | null;
  benchmarkLeadTimeDays: number | null;
  firstReceiptLeadTimeDays: number | null;
  finalReceiptLeadTimeDays: number | null;
  delayDays: number;
  fillRatePercent: number;
  isCompleted: boolean;
  isPartiallyReceived: boolean;
  isOnTime: boolean | null;
  isLateOpen: boolean;
};

export type SupplierLeadTimeIntelligence = {
  supplier: {
    id: number;
    code: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    configuredLeadTimeDays: number | null;
    paymentTermsDays: number | null;
  };
  metrics: {
    trackedPoCount: number;
    completedPoCount: number;
    activePoCount: number;
    openLatePoCount: number;
    partialReceiptPoCount: number;
    onTimeRatePercent: number | null;
    averageFirstReceiptLeadTimeDays: number | null;
    averageFinalReceiptLeadTimeDays: number | null;
    recommendedLeadTimeDays: number | null;
    recommendedBufferDays: number | null;
    averageDelayDays: number | null;
    averageFillRatePercent: number | null;
    partialReceiptRatePercent: number | null;
    performanceBand: "STABLE" | "WATCH" | "AT_RISK" | "INSUFFICIENT_DATA";
    latestReceiptAt: string | null;
  };
  recentOrders: SupplierLeadTimeOrderDetail[];
};

export function buildSupplierLeadTimeIntelligence(
  supplier: SupplierLeadTimeRecord,
  now = new Date(),
): SupplierLeadTimeIntelligence {
  const orderDetails: SupplierLeadTimeOrderDetail[] = supplier.purchaseOrders.map((purchaseOrder) => {
    const anchorDate =
      purchaseOrder.approvedAt ?? purchaseOrder.submittedAt ?? purchaseOrder.orderDate;
    const firstReceiptAt = purchaseOrder.goodsReceipts[0]?.receivedAt ?? null;
    const lastReceiptAt =
      purchaseOrder.goodsReceipts[purchaseOrder.goodsReceipts.length - 1]?.receivedAt ?? null;
    const finalReceiptAt = purchaseOrder.receivedAt ?? lastReceiptAt ?? null;
    const benchmarkDueAt =
      purchaseOrder.expectedAt ??
      (supplier.leadTimeDays !== null && supplier.leadTimeDays !== undefined
        ? addDays(anchorDate, supplier.leadTimeDays)
        : null);
    const benchmarkLeadTimeDays = benchmarkDueAt ? diffDays(anchorDate, benchmarkDueAt) : null;
    const firstReceiptLeadTimeDays = firstReceiptAt ? diffDays(anchorDate, firstReceiptAt) : null;
    const finalReceiptLeadTimeDays = finalReceiptAt ? diffDays(anchorDate, finalReceiptAt) : null;
    const quantityOrdered = purchaseOrder.items.reduce(
      (sum, item) => sum + item.quantityOrdered,
      0,
    );
    const quantityReceived = purchaseOrder.items.reduce(
      (sum, item) => sum + item.quantityReceived,
      0,
    );
    const fillRatePercent =
      quantityOrdered > 0 ? roundToOne((quantityReceived / quantityOrdered) * 100) : 0;
    const isCompleted = Boolean(finalReceiptAt);
    const isPartiallyReceived =
      quantityReceived > 0 && quantityReceived < quantityOrdered && purchaseOrder.status !== "RECEIVED";
    const isOnTime =
      isCompleted && benchmarkDueAt
        ? finalReceiptAt!.getTime() <= benchmarkDueAt.getTime()
        : isCompleted
          ? null
          : null;
    const isLateOpen =
      !isCompleted && Boolean(benchmarkDueAt) && benchmarkDueAt!.getTime() < now.getTime();

    let delayDays = 0;
    if (benchmarkDueAt && finalReceiptAt && finalReceiptAt.getTime() > benchmarkDueAt.getTime()) {
      delayDays = diffDays(benchmarkDueAt, finalReceiptAt);
    } else if (benchmarkDueAt && isLateOpen) {
      delayDays = diffDays(benchmarkDueAt, now);
    }

    return {
      id: purchaseOrder.id,
      poNumber: purchaseOrder.poNumber,
      warehouse: purchaseOrder.warehouse,
      status: purchaseOrder.status,
      orderDate: purchaseOrder.orderDate.toISOString(),
      anchorDate: anchorDate.toISOString(),
      expectedAt: toIso(purchaseOrder.expectedAt),
      benchmarkDueAt: toIso(benchmarkDueAt),
      firstReceiptAt: toIso(firstReceiptAt),
      finalReceiptAt: toIso(finalReceiptAt),
      configuredLeadTimeDays: supplier.leadTimeDays ?? null,
      benchmarkLeadTimeDays,
      firstReceiptLeadTimeDays,
      finalReceiptLeadTimeDays,
      delayDays,
      fillRatePercent,
      isCompleted,
      isPartiallyReceived,
      isOnTime,
      isLateOpen,
    };
  });

  const firstReceiptLeadTimes = orderDetails
    .map((detail) => detail.firstReceiptLeadTimeDays)
    .filter((value): value is number => value !== null);
  const finalReceiptLeadTimes = orderDetails
    .map((detail) => detail.finalReceiptLeadTimeDays)
    .filter((value): value is number => value !== null);
  const lateDelays = orderDetails
    .map((detail) => detail.delayDays)
    .filter((value) => value > 0);
  const completedOrders = orderDetails.filter((detail) => detail.isCompleted);
  const partialOrders = orderDetails.filter((detail) => detail.isPartiallyReceived);
  const openLateOrders = orderDetails.filter((detail) => detail.isLateOpen);
  const onTimeEligible = completedOrders.filter((detail) => detail.isOnTime !== null);
  const onTimeOrders = onTimeEligible.filter((detail) => detail.isOnTime);
  const observedLeadTimeP80 = percentile(finalReceiptLeadTimes, 0.8);
  const averageFinalReceiptLeadTimeDays = average(finalReceiptLeadTimes);
  const recommendedLeadTimeDays = (() => {
    const candidates = [
      supplier.leadTimeDays ?? null,
      observedLeadTimeP80,
      averageFinalReceiptLeadTimeDays !== null ? Math.ceil(averageFinalReceiptLeadTimeDays) : null,
    ].filter((value): value is number => value !== null);

    if (candidates.length === 0) return null;
    return Math.max(...candidates);
  })();
  const recommendedBufferDays =
    recommendedLeadTimeDays !== null && supplier.leadTimeDays !== null && supplier.leadTimeDays !== undefined
      ? Math.max(0, recommendedLeadTimeDays - supplier.leadTimeDays)
      : null;
  const onTimeRatePercent = percentage(onTimeOrders.length, onTimeEligible.length);
  const averageDelayDays = average(lateDelays);
  const performanceBand = getPerformanceBand(
    orderDetails.length,
    onTimeRatePercent,
    openLateOrders.length,
    averageDelayDays,
  );
  const latestReceiptAt = completedOrders
    .map((detail) => detail.finalReceiptAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .reverse()[0] ?? null;

  return {
    supplier: {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      contactName: supplier.contactName ?? null,
      email: supplier.email ?? null,
      phone: supplier.phone ?? null,
      configuredLeadTimeDays: supplier.leadTimeDays ?? null,
      paymentTermsDays: supplier.paymentTermsDays ?? null,
    },
    metrics: {
      trackedPoCount: orderDetails.length,
      completedPoCount: completedOrders.length,
      activePoCount: orderDetails.length - completedOrders.length,
      openLatePoCount: openLateOrders.length,
      partialReceiptPoCount: partialOrders.length,
      onTimeRatePercent,
      averageFirstReceiptLeadTimeDays: average(firstReceiptLeadTimes),
      averageFinalReceiptLeadTimeDays,
      recommendedLeadTimeDays,
      recommendedBufferDays,
      averageDelayDays,
      averageFillRatePercent: average(orderDetails.map((detail) => detail.fillRatePercent)),
      partialReceiptRatePercent: percentage(partialOrders.length, orderDetails.length),
      performanceBand,
      latestReceiptAt,
    },
    recentOrders: orderDetails.slice(0, 12),
  };
}
