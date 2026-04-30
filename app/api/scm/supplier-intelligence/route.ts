import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import {
  buildSupplierLeadTimeIntelligence,
  supplierLeadTimeInclude,
  type SupplierLeadTimeIntelligence,
} from "@/lib/supplier-intelligence";

const SUPPLIER_INTELLIGENCE_READ_PERMISSIONS = [
  "supplier_performance.read",
] as const;

function canReadSupplierIntelligence(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return SUPPLIER_INTELLIGENCE_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadSupplierIntelligence(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const requestedWindowDays = Number(request.nextUrl.searchParams.get("windowDays") || "365");
    const windowDays =
      Number.isInteger(requestedWindowDays) && requestedWindowDays > 0
        ? Math.min(requestedWindowDays, 1095)
        : 365;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - windowDays);

    const suppliers = await prisma.supplier.findMany({
      where: {
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { id: supplierId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        purchaseOrders: {
          some: {
            orderDate: { gte: fromDate },
            status: { notIn: ["DRAFT", "CANCELLED"] },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: supplierLeadTimeInclude,
    });

    const rows = suppliers
      .map((supplier) => ({
        ...supplier,
        purchaseOrders: supplier.purchaseOrders.filter((purchaseOrder) => purchaseOrder.orderDate >= fromDate),
      }))
      .map((supplier) => buildSupplierLeadTimeIntelligence(supplier))
      .filter((row) => row.metrics.trackedPoCount > 0);

    const overview = {
      supplierCount: rows.length,
      trackedPoCount: rows.reduce((sum, row) => sum + row.metrics.trackedPoCount, 0),
      completedPoCount: rows.reduce((sum, row) => sum + row.metrics.completedPoCount, 0),
      openLatePoCount: rows.reduce((sum, row) => sum + row.metrics.openLatePoCount, 0),
      averageObservedLeadTimeDays: average(
        rows
          .map((row) => row.metrics.averageFinalReceiptLeadTimeDays)
          .filter((value): value is number => value !== null),
      ),
      averageRecommendedLeadTimeDays: average(
        rows
          .map((row) => row.metrics.recommendedLeadTimeDays)
          .filter((value): value is number => value !== null),
      ),
      averageOnTimeRatePercent: average(
        rows
          .map((row) => row.metrics.onTimeRatePercent)
          .filter((value): value is number => value !== null),
      ),
      atRiskSupplierCount: rows.filter((row) => row.metrics.performanceBand === "AT_RISK").length,
      stableSupplierCount: rows.filter((row) => row.metrics.performanceBand === "STABLE").length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      windowDays,
      overview,
      rows,
    } satisfies {
      generatedAt: string;
      windowDays: number;
      overview: {
        supplierCount: number;
        trackedPoCount: number;
        completedPoCount: number;
        openLatePoCount: number;
        averageObservedLeadTimeDays: number | null;
        averageRecommendedLeadTimeDays: number | null;
        averageOnTimeRatePercent: number | null;
        atRiskSupplierCount: number;
        stableSupplierCount: number;
      };
      rows: SupplierLeadTimeIntelligence[];
    });
  } catch (error) {
    console.error("SUPPLIER INTELLIGENCE GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier lead-time intelligence." },
      { status: 500 },
    );
  }
}
