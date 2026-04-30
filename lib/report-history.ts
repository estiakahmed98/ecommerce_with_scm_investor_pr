import type { Prisma, ShipmentStatus } from "@/generated/prisma";
import { getInventoryStatus } from "@/lib/stock-status";

type TransactionClient = Prisma.TransactionClient;

type InventorySnapshotClient = Pick<
  TransactionClient,
  "productVariant" | "inventoryDailySnapshot" | "inventoryWarehouseDailySnapshot"
>;

type ShipmentLogClient = Pick<TransactionClient, "shipmentStatusLog">;

export function getLocalSnapshotDate(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export async function appendShipmentStatusLog(
  tx: ShipmentLogClient,
  input: {
    shipmentId: number;
    fromStatus?: ShipmentStatus | null;
    toStatus: ShipmentStatus;
    source: string;
    note?: string | null;
    createdAt?: Date;
  },
) {
  if (input.fromStatus === input.toStatus) {
    return null;
  }

  return tx.shipmentStatusLog.create({
    data: {
      shipmentId: input.shipmentId,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus,
      source: input.source,
      note: input.note ?? null,
      createdAt: input.createdAt,
    },
  });
}

export async function captureVariantInventoryDailySnapshots(
  tx: InventorySnapshotClient,
  productVariantId: number,
  capturedAt = new Date(),
) {
  const snapshotDate = getLocalSnapshotDate(capturedAt);
  const variant = await tx.productVariant.findUnique({
    where: { id: productVariantId },
    select: {
      id: true,
      productId: true,
      stock: true,
      lowStockThreshold: true,
      stockLevels: {
        select: {
          warehouseId: true,
          quantity: true,
          reserved: true,
        },
      },
    },
  });

  if (!variant) {
    return null;
  }

  const stock = Math.max(0, Number(variant.stock) || 0);
  const lowStockThreshold = Math.max(0, Number(variant.lowStockThreshold) || 0);
  const status = getInventoryStatus(stock, lowStockThreshold);

  await tx.inventoryDailySnapshot.upsert({
    where: {
      snapshotDate_variantId: {
        snapshotDate,
        variantId: variant.id,
      },
    },
    create: {
      snapshotDate,
      productId: variant.productId,
      variantId: variant.id,
      stock,
      lowStockThreshold,
      status,
    },
    update: {
      productId: variant.productId,
      stock,
      lowStockThreshold,
      status,
    },
  });

  const warehouseIds = variant.stockLevels.map((level) => level.warehouseId);

  if (warehouseIds.length > 0) {
    await tx.inventoryWarehouseDailySnapshot.deleteMany({
      where: {
        snapshotDate,
        variantId: variant.id,
        warehouseId: {
          notIn: warehouseIds,
        },
      },
    });
  } else {
    await tx.inventoryWarehouseDailySnapshot.deleteMany({
      where: {
        snapshotDate,
        variantId: variant.id,
      },
    });
  }

  for (const level of variant.stockLevels) {
    const quantity = Math.max(0, Number(level.quantity) || 0);
    const reserved = Math.max(0, Number(level.reserved) || 0);
    const available = Math.max(0, quantity - reserved);

    await tx.inventoryWarehouseDailySnapshot.upsert({
      where: {
        snapshotDate_variantId_warehouseId: {
          snapshotDate,
          variantId: variant.id,
          warehouseId: level.warehouseId,
        },
      },
      create: {
        snapshotDate,
        productId: variant.productId,
        variantId: variant.id,
        warehouseId: level.warehouseId,
        quantity,
        reserved,
        available,
      },
      update: {
        productId: variant.productId,
        quantity,
        reserved,
        available,
      },
    });
  }

  return {
    snapshotDate,
    variantId: variant.id,
    stock,
    lowStockThreshold,
    status,
  };
}
