import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

function clampNonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny(["stock_alerts.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      warehouseId?: unknown;
    };
    const warehouseId = Number(body.warehouseId ?? "");
    const targetWarehouse =
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null;

    const hasGlobalScope = access.isSuperAdmin || access.hasGlobal("stock_alerts.manage");
    if (!hasGlobalScope && targetWarehouse === null && access.warehouseIds.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseFilter =
      targetWarehouse !== null
        ? { warehouseId: targetWarehouse }
        : !hasGlobalScope && access.warehouseIds.length > 0
          ? { warehouseId: { in: access.warehouseIds } }
          : undefined;

    if (targetWarehouse !== null && !access.canAccessWarehouse(targetWarehouse)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stockLevels = await prisma.stockLevel.findMany({
      where: warehouseFilter ?? undefined,
      include: {
        variant: {
          select: {
            id: true,
            lowStockThreshold: true,
            product: { select: { lowStockThreshold: true } },
          },
        },
      },
    });

    const targetWarehouseIds = Array.from(
      new Set(stockLevels.map((level) => level.warehouseId)),
    );

    const openAlerts = await prisma.reorderAlert.findMany({
      where: {
        warehouseId: targetWarehouseIds.length > 0 ? { in: targetWarehouseIds } : undefined,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      select: { warehouseId: true, productVariantId: true },
    });

    const existingKeys = new Set(
      openAlerts.map((alert) => `${alert.warehouseId}:${alert.productVariantId}`),
    );

    const createRows = stockLevels
      .map((level) => {
        const threshold = clampNonNegative(
          Number(level.variant.lowStockThreshold || level.variant.product.lowStockThreshold || 0),
        );
        const available = Math.max(0, Number(level.quantity) - Number(level.reserved));
        if (threshold <= 0 || available >= threshold) {
          return null;
        }
        const key = `${level.warehouseId}:${level.productVariantId}`;
        if (existingKeys.has(key)) {
          return null;
        }
        const suggestedQty = Math.max(0, threshold * 2 - available);
        return {
          warehouseId: level.warehouseId,
          productVariantId: level.productVariantId,
          stockOnHand: available,
          threshold,
          suggestedQty,
          createdById: access.userId,
        };
      })
      .filter(Boolean) as Array<{
      warehouseId: number;
      productVariantId: number;
      stockOnHand: number;
      threshold: number;
      suggestedQty: number;
      createdById: string;
    }>;

    if (createRows.length === 0) {
      return NextResponse.json({ created: 0 });
    }

    const result = await prisma.reorderAlert.createMany({
      data: createRows,
      skipDuplicates: true,
    });

    return NextResponse.json({ created: result.count });
  } catch (error) {
    console.error("REORDER ALERT SCAN ERROR:", error);
    return NextResponse.json(
      { error: "Failed to scan reorder alerts." },
      { status: 500 },
    );
  }
}
