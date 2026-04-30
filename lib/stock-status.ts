export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export type InventoryStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function normalizeLowStockThreshold(
  value: unknown,
  fallback = DEFAULT_LOW_STOCK_THRESHOLD,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function getInventoryStatus(stock: unknown, threshold: unknown): InventoryStatus {
  const normalizedStock = Math.max(0, Number(stock) || 0);
  const normalizedThreshold = normalizeLowStockThreshold(threshold);

  if (normalizedStock <= 0) return "OUT_OF_STOCK";
  if (normalizedStock <= normalizedThreshold) return "LOW_STOCK";
  return "IN_STOCK";
}
