import { Prisma, PrismaClient } from "@/generated/prisma";

type TaxRateRow = {
  id: number;
  VatClassId: number;
  countryCode: string;
  regionCode?: string | null;
  rate: Prisma.Decimal | number | string;
  inclusive: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};

export type TaxableLineItemInput = {
  productId: number;
  variantId?: number | null;
  quantity: number;
  unitPrice: number;
  currency?: string | null;
  vatClassId?: number | null;
  vatClassName?: string | null;
  vatClassCode?: string | null;
};

type TaxDataSource = PrismaClient | Prisma.TransactionClient;

const COUNTRY_ALIASES: Record<string, string> = {
  bangladesh: "BD",
  india: "IN",
  pakistan: "PK",
  nepal: "NP",
  malaysia: "MY",
  singapore: "SG",
  "united states": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  uae: "AE",
  "saudi arabia": "SA",
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeTaxCountryCode(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return "BD";
  if (raw.length === 2) return raw.toUpperCase();
  return COUNTRY_ALIASES[raw.toLowerCase()] || raw.slice(0, 2).toUpperCase();
}

function normalizeRegionCode(input?: string | null) {
  const raw = String(input || "").trim();
  return raw ? raw.toUpperCase() : null;
}

function selectBestRate(
  rates: TaxRateRow[],
  vatClassId: number,
  countryCode: string,
  regionCode: string | null,
) {
  const now = new Date();
  const candidates = rates.filter((rate) => {
    if (rate.VatClassId !== vatClassId) return false;
    if (String(rate.countryCode || "").toUpperCase() !== countryCode) return false;

    const start = asDate(rate.startDate);
    const end = asDate(rate.endDate);
    if (start && start > now) return false;
    if (end && end < now) return false;
    return true;
  });

  if (candidates.length === 0) {
    return null;
  }

  const exactRegion = regionCode
    ? candidates.find(
        (rate) => normalizeRegionCode(rate.regionCode) === regionCode,
      ) || null
    : null;

  if (exactRegion) {
    return exactRegion;
  }

  return (
    candidates.find((rate) => !normalizeRegionCode(rate.regionCode)) ||
    candidates[0]
  );
}

export async function calculateTaxForItems(
  db: TaxDataSource,
  input: {
    country: string;
    district?: string | null;
    currency?: string | null;
    items: TaxableLineItemInput[];
  },
) {
  const countryCode = normalizeTaxCountryCode(input.country);
  const regionCode = normalizeRegionCode(input.district);
  const vatClassIds = Array.from(
    new Set(
      input.items
        .map((item) => item.vatClassId ?? null)
        .filter(
          (value): value is number =>
            typeof value === "number" &&
            Number.isInteger(value) &&
            value > 0,
        ),
    ),
  );

  if (vatClassIds.length === 0) {
    return {
      countryCode,
      regionCode,
      currency: input.currency || "BDT",
      totalVAT: 0,
      totalTaxCharge: 0,
      totalInclusiveVAT: 0,
      totalExclusiveVAT: 0,
      breakdown: [],
      items: input.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
        unitPrice: roundMoney(item.unitPrice),
        lineSubtotal: roundMoney(item.unitPrice * item.quantity),
        VatAmount: 0,
        taxCharge: 0,
      })),
    };
  }

  const rates = await db.vatRate.findMany({
    where: {
      VatClassId: { in: vatClassIds },
      countryCode,
    },
    orderBy: [{ regionCode: "desc" }, { startDate: "desc" }, { id: "desc" }],
  });

  const breakdownMap = new Map<
    string,
    {
      vatClassId: number;
      className: string;
      classCode: string;
      rate: number;
      inclusive: boolean;
      countryCode: string;
      regionCode: string | null;
      taxableAmount: number;
      vatAmount: number;
      taxCharge: number;
    }
  >();

  let totalVAT = 0;
  let totalTaxCharge = 0;
  let totalInclusiveVAT = 0;
  let totalExclusiveVAT = 0;

  const itemResults = input.items.map((item) => {
    const lineSubtotal = roundMoney(item.unitPrice * item.quantity);
    const result = {
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
      unitPrice: roundMoney(item.unitPrice),
      lineSubtotal,
      VatAmount: 0,
      taxCharge: 0,
    };

    if (!item.vatClassId) {
      return result;
    }

    const matchedRate = selectBestRate(rates as TaxRateRow[], item.vatClassId, countryCode, regionCode);
    if (!matchedRate) {
      return result;
    }

    const rateValue = Number(matchedRate.rate || 0);
    if (!Number.isFinite(rateValue) || rateValue <= 0) {
      return result;
    }

    const inclusive = Boolean(matchedRate.inclusive);
    const vatAmount = inclusive
      ? roundMoney(lineSubtotal - lineSubtotal / (1 + rateValue))
      : roundMoney(lineSubtotal * rateValue);
    const taxCharge = inclusive ? 0 : vatAmount;
    const taxableAmount = inclusive
      ? roundMoney(lineSubtotal - vatAmount)
      : lineSubtotal;

    result.VatAmount = vatAmount;
    result.taxCharge = taxCharge;

    totalVAT = roundMoney(totalVAT + vatAmount);
    totalTaxCharge = roundMoney(totalTaxCharge + taxCharge);
    totalInclusiveVAT = roundMoney(totalInclusiveVAT + (inclusive ? vatAmount : 0));
    totalExclusiveVAT = roundMoney(totalExclusiveVAT + (inclusive ? 0 : vatAmount));

    const key = [
      item.vatClassId,
      countryCode,
      normalizeRegionCode(matchedRate.regionCode) || "",
      rateValue,
      inclusive ? "I" : "E",
    ].join(":");

    const current =
      breakdownMap.get(key) || {
        vatClassId: item.vatClassId,
        className: String(item.vatClassName || "VAT"),
        classCode: String(item.vatClassCode || item.vatClassId),
        rate: roundMoney(rateValue * 100),
        inclusive,
        countryCode,
        regionCode: normalizeRegionCode(matchedRate.regionCode),
        taxableAmount: 0,
        vatAmount: 0,
        taxCharge: 0,
      };

    current.taxableAmount = roundMoney(current.taxableAmount + taxableAmount);
    current.vatAmount = roundMoney(current.vatAmount + vatAmount);
    current.taxCharge = roundMoney(current.taxCharge + taxCharge);
    breakdownMap.set(key, current);

    return result;
  });

  return {
    countryCode,
    regionCode,
    currency: input.currency || "BDT",
    totalVAT,
    totalTaxCharge,
    totalInclusiveVAT,
    totalExclusiveVAT,
    breakdown: Array.from(breakdownMap.values()),
    items: itemResults,
  };
}
