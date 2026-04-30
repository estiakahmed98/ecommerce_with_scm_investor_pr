export const ALLOWED_SHIPPING_AREAS = [
  "Dhaka",
  "Outside Dhaka",
  "Outside Bangladesh",
] as const;

export type AllowedShippingArea = (typeof ALLOWED_SHIPPING_AREAS)[number];

export function normalizeShippingArea(input: string): AllowedShippingArea | null {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;

  if (raw === "dhaka" || raw === "inside dhaka") return "Dhaka";
  if (raw === "outside dhaka" || raw === "out side dhaka") return "Outside Dhaka";
  if (raw === "outside bangladesh" || raw === "out side bangladesh") return "Outside Bangladesh";
  return null;
}

export function isAllowedShippingArea(input: string): boolean {
  return normalizeShippingArea(input) !== null;
}

