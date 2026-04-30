import { prisma } from "@/lib/prisma";
import { appendShipmentStatusLog, captureVariantInventoryDailySnapshots } from "@/lib/report-history";

type ShipmentBackfillRow = {
  id: number;
  status:
    | "PENDING"
    | "ASSIGNED"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "FAILED"
    | "RETURNED"
    | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  deliveryConfirmationRequestedAt: Date | null;
};

function addMs(value: Date, ms: number) {
  return new Date(value.getTime() + ms);
}

function buildShipmentTimeline(shipment: ShipmentBackfillRow) {
  const events: Array<{ at: Date; toStatus: ShipmentBackfillRow["status"] }> = [
    { at: shipment.createdAt, toStatus: "PENDING" },
  ];

  if (shipment.shippedAt) {
    events.push({
      at: shipment.shippedAt > shipment.createdAt ? shipment.shippedAt : addMs(shipment.createdAt, 1000),
      toStatus: "IN_TRANSIT",
    });
  }

  if (shipment.deliveryConfirmationRequestedAt) {
    const base = shipment.shippedAt || shipment.createdAt;
    events.push({
      at:
        shipment.deliveryConfirmationRequestedAt > base
          ? shipment.deliveryConfirmationRequestedAt
          : addMs(base, 2000),
      toStatus: "OUT_FOR_DELIVERY",
    });
  }

  if (shipment.status !== "PENDING") {
    const terminalAt =
      shipment.status === "DELIVERED"
        ? shipment.deliveredAt || shipment.updatedAt
        : shipment.updatedAt;
    events.push({
      at: terminalAt,
      toStatus: shipment.status,
    });
  }

  events.sort((left, right) => left.at.getTime() - right.at.getTime());

  const normalized: Array<{ at: Date; toStatus: ShipmentBackfillRow["status"] }> = [];
  for (const event of events) {
    const previous = normalized[normalized.length - 1];
    if (previous?.toStatus === event.toStatus) {
      if (event.at > previous.at) {
        previous.at = event.at;
      }
      continue;
    }
    normalized.push({ ...event });
  }

  return normalized;
}

export async function backfillOrderCostSnapshots(limit = 500) {
  const rows = await prisma.orderItem.findMany({
    where: {
      costPriceSnapshot: null,
      variantId: { not: null },
    },
    take: limit,
    orderBy: { id: "asc" },
    include: {
      variant: {
        select: {
          costPrice: true,
        },
      },
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.variant?.costPrice == null) {
      skipped += 1;
      continue;
    }

    await prisma.orderItem.update({
      where: { id: row.id },
      data: {
        costPriceSnapshot: row.variant.costPrice,
      },
    });
    updated += 1;
  }

  return {
    scanned: rows.length,
    updated,
    skipped,
  };
}

export async function backfillShipmentStatusHistory(limit = 300) {
  const shipments = await prisma.shipment.findMany({
    where: {
      statusLogs: {
        none: {},
      },
    },
    take: limit,
    orderBy: { id: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      shippedAt: true,
      deliveredAt: true,
      deliveryConfirmationRequestedAt: true,
    },
  });

  let createdLogs = 0;

  for (const shipment of shipments) {
    const timeline = buildShipmentTimeline(shipment);
    let previousStatus: ShipmentBackfillRow["status"] | null = null;
    for (const event of timeline) {
      await appendShipmentStatusLog(prisma, {
        shipmentId: shipment.id,
        fromStatus: previousStatus,
        toStatus: event.toStatus,
        source: "BACKFILL_STATUS",
        note: "Synthetic baseline status event generated for historical reporting",
        createdAt: event.at,
      });
      previousStatus = event.toStatus;
      createdLogs += 1;
    }
  }

  return {
    shipments: shipments.length,
    createdLogs,
  };
}

export async function captureAllInventoryDailySnapshots(limit?: number) {
  const variants = await prisma.productVariant.findMany({
    where: { active: true },
    select: { id: true },
    take: limit,
    orderBy: { id: "asc" },
  });

  for (const variant of variants) {
    await captureVariantInventoryDailySnapshots(prisma, variant.id);
  }

  return {
    variants: variants.length,
  };
}
