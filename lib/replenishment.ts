import { Prisma } from "@/generated/prisma";

export const replenishmentRuleInclude = Prisma.validator<Prisma.ReplenishmentRuleInclude>()({
  warehouse: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  productVariant: {
    select: {
      id: true,
      productId: true,
      sku: true,
      lowStockThreshold: true,
      costPrice: true,
      product: {
        select: {
          id: true,
          name: true,
        },
      },
      stockLevels: {
        select: {
          warehouseId: true,
          quantity: true,
          reserved: true,
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
});

export type ReplenishmentRuleWithRelations = Prisma.ReplenishmentRuleGetPayload<{
  include: typeof replenishmentRuleInclude;
}>;

export type ReplenishmentSuggestion = {
  ruleId: number;
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  productVariantId: number;
  productId: number;
  productName: string;
  sku: string;
  strategy: "MIN_MAX" | "REORDER_POINT";
  availableQty: number;
  onHandQty: number;
  reservedQty: number;
  reorderPoint: number;
  targetStockLevel: number;
  safetyStock: number;
  shortageQty: number;
  transferQty: number;
  purchaseQty: number;
  recommendedAction: "NONE" | "PURCHASE" | "TRANSFER" | "HYBRID";
  leadTimeDays: number | null;
  minOrderQty: number;
  orderMultiple: number;
  triggered: boolean;
  sourceWarehouse:
    | {
        id: number;
        name: string;
        code: string;
        transferableQty: number;
      }
    | null;
};

function roundUpToMultiple(quantity: number, multiple: number) {
  const normalizedMultiple =
    Number.isInteger(multiple) && multiple > 0 ? multiple : 1;
  if (quantity <= 0) return 0;
  return Math.ceil(quantity / normalizedMultiple) * normalizedMultiple;
}

export function buildReplenishmentSuggestion(
  rule: ReplenishmentRuleWithRelations,
): ReplenishmentSuggestion {
  const targetLevel =
    rule.productVariant.stockLevels.find(
      (stockLevel) => stockLevel.warehouseId === rule.warehouseId,
    ) ?? null;

  const onHandQty = Number(targetLevel?.quantity ?? 0);
  const reservedQty = Number(targetLevel?.reserved ?? 0);
  const availableQty = Math.max(0, onHandQty - reservedQty);
  const fallbackThreshold = Math.max(
    0,
    Number(rule.productVariant.lowStockThreshold ?? 0),
  );
  const reorderPoint = Math.max(0, Number(rule.reorderPoint || fallbackThreshold));
  const safetyStock = Math.max(0, Number(rule.safetyStock || 0));
  const baseTarget = Math.max(
    Number(rule.targetStockLevel || 0),
    reorderPoint + safetyStock,
  );
  const targetStockLevel = baseTarget > 0 ? baseTarget : reorderPoint;
  const triggered = availableQty <= reorderPoint;
  const shortageQty = triggered ? Math.max(0, targetStockLevel - availableQty) : 0;

  const sourceCandidates = rule.productVariant.stockLevels
    .filter((stockLevel) => stockLevel.warehouseId !== rule.warehouseId)
    .map((stockLevel) => {
      const sourceAvailable = Math.max(
        0,
        Number(stockLevel.quantity ?? 0) - Number(stockLevel.reserved ?? 0),
      );
      const sourceBuffer = Math.max(fallbackThreshold, safetyStock);
      const transferableQty = Math.max(0, sourceAvailable - sourceBuffer);
      return {
        id: stockLevel.warehouse.id,
        name: stockLevel.warehouse.name,
        code: stockLevel.warehouse.code,
        transferableQty,
      };
    })
    .filter((candidate) => candidate.transferableQty > 0)
    .sort((left, right) => right.transferableQty - left.transferableQty);

  const bestSource = sourceCandidates[0] ?? null;
  const transferQty = shortageQty > 0 ? Math.min(bestSource?.transferableQty ?? 0, shortageQty) : 0;
  const rawPurchaseQty = Math.max(0, shortageQty - transferQty);
  const purchaseBase =
    rawPurchaseQty > 0 ? Math.max(rawPurchaseQty, Math.max(1, rule.minOrderQty)) : 0;
  const purchaseQty = roundUpToMultiple(
    purchaseBase,
    Math.max(1, rule.orderMultiple),
  );

  let recommendedAction: ReplenishmentSuggestion["recommendedAction"] = "NONE";
  if (transferQty > 0 && purchaseQty > 0) {
    recommendedAction = "HYBRID";
  } else if (transferQty > 0) {
    recommendedAction = "TRANSFER";
  } else if (purchaseQty > 0) {
    recommendedAction = "PURCHASE";
  }

  return {
    ruleId: rule.id,
    warehouseId: rule.warehouseId,
    warehouseName: rule.warehouse.name,
    warehouseCode: rule.warehouse.code,
    productVariantId: rule.productVariantId,
    productId: rule.productVariant.productId,
    productName: rule.productVariant.product.name,
    sku: rule.productVariant.sku,
    strategy: rule.strategy,
    availableQty,
    onHandQty,
    reservedQty,
    reorderPoint,
    targetStockLevel,
    safetyStock,
    shortageQty,
    transferQty,
    purchaseQty,
    recommendedAction,
    leadTimeDays: rule.leadTimeDays ?? null,
    minOrderQty: Math.max(1, rule.minOrderQty),
    orderMultiple: Math.max(1, rule.orderMultiple),
    triggered,
    sourceWarehouse: bestSource,
  };
}
