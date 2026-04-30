import type { Prisma } from "@/generated/prisma";
import { captureVariantInventoryDailySnapshots } from "@/lib/report-history";

type TransactionClient = Prisma.TransactionClient;
type InventoryClient = Pick<
  Prisma.TransactionClient,
  | "warehouse"
  | "stockLevel"
  | "productVariant"
  | "inventoryLog"
  | "inventoryDailySnapshot"
  | "inventoryWarehouseDailySnapshot"
>;

export function computeAvailableStock(
  levels: Array<{ quantity: number; reserved: number }>,
) {
  return Math.max(
    0,
    levels.reduce(
      (sum, level) => sum + Math.max(0, Number(level.quantity) - Number(level.reserved)),
      0,
    ),
  );
}

export async function getPrimaryWarehouseId(tx: InventoryClient) {
  const warehouse = await tx.warehouse.findFirst({
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    select: { id: true },
  });

  return warehouse?.id ?? null;
}

export async function refreshVariantStock(
  tx: InventoryClient,
  productVariantId: number,
) {
  const levels = await tx.stockLevel.findMany({
    where: { productVariantId },
    select: { quantity: true, reserved: true },
  });

  const stock = computeAvailableStock(levels);
  await tx.productVariant.update({
    where: { id: productVariantId },
    data: { stock },
  });

  return stock;
}

export async function syncVariantWarehouseStock(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  quantity: number;
  reason: string;
  warehouseId?: number | null;
}) {
  const { tx, productId, productVariantId, quantity, reason } = params;

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Stock quantity must be 0 or more");
  }

  const warehouseId =
    params.warehouseId ?? (await getPrimaryWarehouseId(tx));

  if (!warehouseId) {
    if (quantity === 0) {
      await tx.productVariant.update({
        where: { id: productVariantId },
        data: { stock: 0 },
      });
      return { warehouseId: null, stock: 0 };
    }

    throw new Error(
      "A warehouse is required before adding stock to a physical product",
    );
  }

  const existing = await tx.stockLevel.findUnique({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    select: { quantity: true },
  });

  await tx.stockLevel.upsert({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    create: {
      warehouseId,
      productVariantId,
      quantity,
      reserved: 0,
    },
    update: {
      quantity,
    },
  });

  const stock = await refreshVariantStock(tx, productVariantId);
  const change = quantity - Number(existing?.quantity ?? 0);

  if (change !== 0) {
    await tx.inventoryLog.create({
      data: {
        productId,
        variantId: productVariantId,
        warehouseId,
        change,
        reason,
      },
    });
  }

  await captureVariantInventoryDailySnapshots(tx, productVariantId);

  return { warehouseId, stock };
}

export async function deductVariantInventory(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  quantity: number;
  reason: string;
}) {
  const { tx, productId, productVariantId, quantity, reason } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Deduction quantity must be greater than 0");
  }

  const levels = await tx.stockLevel.findMany({
    where: { productVariantId },
    include: {
      warehouse: {
        select: { id: true, code: true, isDefault: true },
      },
    },
    orderBy: [{ warehouse: { isDefault: "desc" } }, { warehouseId: "asc" }],
  });

  const totalAvailable = computeAvailableStock(levels);
  if (totalAvailable < quantity) {
    throw new Error("Insufficient stock for the selected variant");
  }

  let remaining = quantity;

  for (const level of levels) {
    if (remaining <= 0) break;

    const available = Math.max(0, Number(level.quantity) - Number(level.reserved));
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const updated = await tx.stockLevel.updateMany({
      where: {
        id: level.id,
        quantity: {
          gte: Number(level.reserved) + take,
        },
      },
      data: {
        quantity: {
          decrement: take,
        },
      },
    });

    if (updated.count !== 1) {
      throw new Error("Stock changed during checkout. Please try again.");
    }

    await tx.inventoryLog.create({
      data: {
        productId,
        variantId: productVariantId,
        warehouseId: level.warehouseId,
        change: -take,
        reason: `${reason} (${level.warehouse.code})`,
      },
    });

    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error("Unable to allocate inventory across warehouses");
  }

  const stock = await refreshVariantStock(tx, productVariantId);
  await captureVariantInventoryDailySnapshots(tx, productVariantId);
  return { stock };
}

export async function receiveVariantInventory(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  warehouseId: number;
  quantity: number;
  reason: string;
}) {
  const { tx, productId, productVariantId, warehouseId, quantity, reason } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Receipt quantity must be greater than 0");
  }

  await tx.stockLevel.upsert({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    create: {
      warehouseId,
      productVariantId,
      quantity,
      reserved: 0,
    },
    update: {
      quantity: {
        increment: quantity,
      },
    },
  });

  await tx.inventoryLog.create({
    data: {
      productId,
      variantId: productVariantId,
      warehouseId,
      change: quantity,
      reason,
    },
  });

  const stock = await refreshVariantStock(tx, productVariantId);
  await captureVariantInventoryDailySnapshots(tx, productVariantId);
  return { stock };
}

export async function dispatchVariantInventory(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  warehouseId: number;
  quantity: number;
  reason: string;
}) {
  const {
    tx,
    productId,
    productVariantId,
    warehouseId,
    quantity,
    reason,
  } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Dispatch quantity must be greater than 0");
  }

  const sourceLevel = await tx.stockLevel.findUnique({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    select: {
      quantity: true,
      reserved: true,
    },
  });

  const sourceAvailable = Math.max(
    0,
    Number(sourceLevel?.quantity ?? 0) - Number(sourceLevel?.reserved ?? 0),
  );
  if (sourceAvailable < quantity) {
    throw new Error("Insufficient source warehouse stock for transfer");
  }

  const updated = await tx.stockLevel.updateMany({
    where: {
      warehouseId,
      productVariantId,
      quantity: {
        gte: Number(sourceLevel?.reserved ?? 0) + quantity,
      },
    },
    data: {
      quantity: {
        decrement: quantity,
      },
    },
  });

  if (updated.count !== 1) {
    throw new Error("Warehouse stock changed during dispatch. Please try again.");
  }

  await tx.inventoryLog.create({
    data: {
      productId,
      variantId: productVariantId,
      warehouseId,
      change: -quantity,
      reason,
    },
  });

  const stock = await refreshVariantStock(tx, productVariantId);
  await captureVariantInventoryDailySnapshots(tx, productVariantId);
  return { stock };
}
