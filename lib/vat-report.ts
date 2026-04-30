import { prisma } from "@/lib/prisma";

type DateRangeInput = {
  from?: string | null;
  to?: string | null;
};

type TaxSnapshotBreakdownRow = {
  vatClassId?: number | null;
  className?: string | null;
  classCode?: string | null;
  rate?: number | null;
  inclusive?: boolean | null;
  taxableAmount?: number | null;
  vatAmount?: number | null;
  taxCharge?: number | null;
  countryCode?: string | null;
  regionCode?: string | null;
};

type TaxSnapshot = {
  totalVAT?: number | null;
  totalTaxCharge?: number | null;
  totalInclusiveVAT?: number | null;
  totalExclusiveVAT?: number | null;
  breakdown?: TaxSnapshotBreakdownRow[] | null;
};

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function parseDateOnly(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function buildDateRange(input: DateRangeInput) {
  const now = new Date();
  const fallbackFrom = addDays(now, -29);
  const fromDate = startOfDay(parseDateOnly(input.from, fallbackFrom));
  const toDate = startOfDay(parseDateOnly(input.to, now));
  const toExclusive = addDays(toDate, 1);

  if (toExclusive < fromDate) {
    return {
      from: fromDate,
      to: addDays(fromDate, 1),
    };
  }

  return {
    from: fromDate,
    to: toExclusive,
  };
}

function formatDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

export type VatClassOverviewRow = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  productCount: number;
  totalOrders: number;
  totalTaxableValue: number;
  totalVatAmount: number;
  totalTaxCharge: number;
  latestRateLabel: string;
};

export type VatOverviewReport = {
  totals: {
    vatClasses: number;
    productsAssigned: number;
    taxedOrders: number;
    totalTaxableValue: number;
    totalVatAmount: number;
    totalTaxCharge: number;
  };
  classes: VatClassOverviewRow[];
};

export type VatProductRow = {
  productId: number;
  productName: string;
  slug: string;
  quantitySold: number;
  orderCount: number;
  taxableValue: number;
  totalVatAmount: number;
};

export type VatOrderRow = {
  orderId: number;
  orderDate: string;
  customerName: string;
  country: string;
  taxableValue: number;
  vatAmount: number;
  taxCharge: number;
};

export type VatClassDetailReport = {
  vatClass: {
    id: number;
    name: string;
    code: string;
    description: string | null;
    productCount: number;
  };
  summary: {
    totalOrders: number;
    totalTaxableValue: number;
    totalVatAmount: number;
    totalTaxCharge: number;
    totalQuantitySold: number;
  };
  rates: Array<{
    id: number;
    countryCode: string;
    regionCode: string | null;
    ratePercent: number;
    inclusive: boolean;
    startDate: string | null;
    endDate: string | null;
  }>;
  products: VatProductRow[];
  orders: VatOrderRow[];
};

export async function getVatOverviewReport(): Promise<VatOverviewReport> {
  return getVatOverviewReportWithRange();
}

export async function getVatOverviewReportWithRange(
  input: DateRangeInput = {},
): Promise<VatOverviewReport> {
  const hasRange = Boolean(input.from || input.to);
  const range = buildDateRange(input);

  const [vatClasses, orders] = await Promise.all([
    prisma.vatClass.findMany({
      include: {
        rates: {
          orderBy: [{ startDate: "desc" }, { id: "desc" }],
        },
        _count: {
          select: { products: true },
        },
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.order.findMany({
      where: {
        status: { not: "CANCELLED" },
        ...(hasRange
          ? {
              order_date: {
                gte: input.from ? range.from : undefined,
                lt: input.to ? range.to : undefined,
              },
            }
          : {}),
      },
      select: {
        id: true,
        taxSnapshot: true,
      },
    }),
  ]);

  const classMap = new Map<number, VatClassOverviewRow>();
  const classIdByCode = new Map<string, number>();
  for (const vatClass of vatClasses) {
    const latestRate = vatClass.rates[0] ?? null;
    classIdByCode.set(String(vatClass.code || "").trim().toUpperCase(), vatClass.id);
    classMap.set(vatClass.id, {
      id: vatClass.id,
      name: vatClass.name,
      code: vatClass.code,
      description: vatClass.description,
      productCount: vatClass._count.products,
      totalOrders: 0,
      totalTaxableValue: 0,
      totalVatAmount: 0,
      totalTaxCharge: 0,
      latestRateLabel: latestRate
        ? `${roundMoney(asNumber(latestRate.rate) * 100)}%${latestRate.inclusive ? " Inclusive" : ""}`
        : "No rate set",
    });
  }

  const classOrderSets = new Map<number, Set<number>>();
  let taxedOrders = 0;
  let totalTaxableValue = 0;
  let totalVatAmount = 0;
  let totalTaxCharge = 0;

  for (const order of orders) {
    const taxSnapshot = (order.taxSnapshot as TaxSnapshot | null) || null;
    const breakdown = taxSnapshot?.breakdown || [];
    if (breakdown.length > 0) {
      taxedOrders += 1;
    }

    for (const row of breakdown) {
      const vatClassId =
        Number(row.vatClassId || 0) ||
        classIdByCode.get(String(row.classCode || "").trim().toUpperCase()) ||
        0;
      if (!vatClassId || !classMap.has(vatClassId)) continue;

      const current = classMap.get(vatClassId)!;
      current.totalTaxableValue = roundMoney(
        current.totalTaxableValue + asNumber(row.taxableAmount),
      );
      current.totalVatAmount = roundMoney(
        current.totalVatAmount + asNumber(row.vatAmount),
      );
      current.totalTaxCharge = roundMoney(
        current.totalTaxCharge + asNumber(row.taxCharge),
      );
      classMap.set(vatClassId, current);

      totalTaxableValue = roundMoney(totalTaxableValue + asNumber(row.taxableAmount));
      totalVatAmount = roundMoney(totalVatAmount + asNumber(row.vatAmount));
      totalTaxCharge = roundMoney(totalTaxCharge + asNumber(row.taxCharge));

      const orderSet = classOrderSets.get(vatClassId) || new Set<number>();
      orderSet.add(order.id);
      classOrderSets.set(vatClassId, orderSet);
    }
  }

  const classes = Array.from(classMap.values())
    .map((row) => ({
      ...row,
      totalOrders: classOrderSets.get(row.id)?.size || 0,
    }))
    .sort((left, right) => right.totalVatAmount - left.totalVatAmount);

  return {
    totals: {
      vatClasses: vatClasses.length,
      productsAssigned: vatClasses.reduce(
        (sum, row) => sum + row._count.products,
        0,
      ),
      taxedOrders,
      totalTaxableValue,
      totalVatAmount,
      totalTaxCharge,
    },
    classes,
  };
}

export async function getVatClassDetailReport(
  vatClassId: number,
  input: DateRangeInput = {},
): Promise<VatClassDetailReport | null> {
  const vatClass = await prisma.vatClass.findUnique({
    where: { id: vatClassId },
    include: {
      rates: {
        orderBy: [{ countryCode: "asc" }, { regionCode: "asc" }, { startDate: "desc" }],
      },
      _count: {
        select: { products: true },
      },
    },
  });

  if (!vatClass) {
    return null;
  }

  const hasRange = Boolean(input.from || input.to);
  const range = buildDateRange(input);

  const orders = await prisma.order.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(hasRange
        ? {
            order_date: {
              gte: input.from ? range.from : undefined,
              lt: input.to ? range.to : undefined,
            },
          }
        : {}),
    },
    select: {
      id: true,
      order_date: true,
      name: true,
      country: true,
      taxSnapshot: true,
      orderItems: {
        select: {
          productId: true,
          quantity: true,
          price: true,
          VatAmount: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              VatClassId: true,
            },
          },
        },
      },
    },
  });

  const productMap = new Map<number, VatProductRow>();
  const productOrderSets = new Map<number, Set<number>>();
  const orderRows: VatOrderRow[] = [];

  let totalOrders = 0;
  let totalTaxableValue = 0;
  let totalVatAmount = 0;
  let totalTaxCharge = 0;
  let totalQuantitySold = 0;

  for (const order of orders) {
    const taxSnapshot = (order.taxSnapshot as TaxSnapshot | null) || null;
    const breakdown = (taxSnapshot?.breakdown || []).filter(
      (row) =>
        Number(row.vatClassId || 0) === vatClassId ||
        String(row.classCode || "").trim().toUpperCase() ===
          String(vatClass.code || "").trim().toUpperCase(),
    );

    if (breakdown.length > 0) {
      const orderTaxableValue = roundMoney(
        breakdown.reduce((sum, row) => sum + asNumber(row.taxableAmount), 0),
      );
      const orderVatAmount = roundMoney(
        breakdown.reduce((sum, row) => sum + asNumber(row.vatAmount), 0),
      );
      const orderTaxCharge = roundMoney(
        breakdown.reduce((sum, row) => sum + asNumber(row.taxCharge), 0),
      );

      totalOrders += 1;
      totalTaxableValue = roundMoney(totalTaxableValue + orderTaxableValue);
      totalVatAmount = roundMoney(totalVatAmount + orderVatAmount);
      totalTaxCharge = roundMoney(totalTaxCharge + orderTaxCharge);

      orderRows.push({
        orderId: order.id,
        orderDate: formatDateLabel(order.order_date),
        customerName: order.name,
        country: order.country,
        taxableValue: orderTaxableValue,
        vatAmount: orderVatAmount,
        taxCharge: orderTaxCharge,
      });
    }

    for (const item of order.orderItems) {
      if (item.product?.VatClassId !== vatClassId) continue;

      const lineValue = roundMoney(asNumber(item.price) * item.quantity);
      const vatAmount = roundMoney(asNumber(item.VatAmount));
      const current = productMap.get(item.productId) || {
        productId: item.productId,
        productName: item.product?.name || `Product #${item.productId}`,
        slug: item.product?.slug || "",
        quantitySold: 0,
        orderCount: 0,
        taxableValue: 0,
        totalVatAmount: 0,
      };

      current.quantitySold += item.quantity;
      current.taxableValue = roundMoney(current.taxableValue + lineValue);
      current.totalVatAmount = roundMoney(current.totalVatAmount + vatAmount);
      productMap.set(item.productId, current);

      totalQuantitySold += item.quantity;

      const orderSet = productOrderSets.get(item.productId) || new Set<number>();
      orderSet.add(order.id);
      productOrderSets.set(item.productId, orderSet);
    }
  }

  const products = Array.from(productMap.values())
    .map((row) => ({
      ...row,
      orderCount: productOrderSets.get(row.productId)?.size || 0,
    }))
    .sort((left, right) => right.totalVatAmount - left.totalVatAmount);

  return {
    vatClass: {
      id: vatClass.id,
      name: vatClass.name,
      code: vatClass.code,
      description: vatClass.description,
      productCount: vatClass._count.products,
    },
    summary: {
      totalOrders,
      totalTaxableValue,
      totalVatAmount,
      totalTaxCharge,
      totalQuantitySold,
    },
    rates: vatClass.rates.map((rate) => ({
      id: rate.id,
      countryCode: rate.countryCode,
      regionCode: rate.regionCode,
      ratePercent: roundMoney(asNumber(rate.rate) * 100),
      inclusive: rate.inclusive,
      startDate: rate.startDate ? formatDateLabel(rate.startDate) : null,
      endDate: rate.endDate ? formatDateLabel(rate.endDate) : null,
    })),
    products,
    orders: orderRows.sort((left, right) => right.orderId - left.orderId),
  };
}
