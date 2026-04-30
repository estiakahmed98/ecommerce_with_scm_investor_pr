import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const GLOBAL_WAREHOUSE_PERMISSIONS = [
  "dashboard.read",
  "inventory.manage",
  "products.manage",
] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny([...GLOBAL_WAREHOUSE_PERMISSIONS])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedWarehouseId = searchParams.get("warehouseId");
    const hasRequestedWarehouse = requestedWarehouseId && requestedWarehouseId !== "all";
    
    const hasGlobalScope =
      access.isSuperAdmin ||
      GLOBAL_WAREHOUSE_PERMISSIONS.some((permission) => access.hasGlobal(permission));

    const accessibleWarehouseIds = hasGlobalScope
      ? (
          await prisma.warehouse.findMany({
            select: { id: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          })
        ).map((warehouse) => warehouse.id)
      : access.warehouseIds;

    let allowedWarehouseIds = accessibleWarehouseIds;

    if (hasRequestedWarehouse) {
      const warehouseId = Number(requestedWarehouseId);
      if (
        !hasGlobalScope &&
        !access.warehouseIds.includes(warehouseId)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      allowedWarehouseIds = allowedWarehouseIds.filter((id) => id === warehouseId);
    }

    if (allowedWarehouseIds.length === 0) {
      return NextResponse.json({
        warehouses: [],
        stats: {
          totalProducts: 0,
          totalStock: 0,
          lowStockItems: 0,
          outOfStockItems: 0,
          reservedUnits: 0,
        },
      });
    }

    const [warehouses, stockLevels, products] = await Promise.all([
      prisma.warehouse.findMany({
        where: { id: { in: accessibleWarehouseIds } },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          isDefault: true,
        },
      }),
      prisma.stockLevel.findMany({
        where: { warehouseId: { in: allowedWarehouseIds } },
        select: {
          warehouseId: true,
          quantity: true,
          reserved: true,
          variant: {
            select: {
              id: true,
              sku: true,
              stock: true,
              lowStockThreshold: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                },
              },
            },
          },
        },
      }),
      prisma.product.findMany({
        where: {
          variants: {
            some: {
              stockLevels: {
                some: {
                  warehouseId: { in: allowedWarehouseIds },
                },
              },
            },
          },
        },
        select: {
          id: true,
          name: true,
          type: true,
        },
      }),
    ]);

    // Calculate statistics for the selected warehouse(s)
    const warehouseStockLevels = stockLevels.filter((level) =>
      allowedWarehouseIds.includes(level.warehouseId),
    );

    const totalProducts = new Set(
      warehouseStockLevels.map((level) => level.variant.product.id),
    ).size;

    const totalStock = warehouseStockLevels.reduce(
      (sum, level) => sum + Number(level.quantity),
      0,
    );

    const reservedUnits = warehouseStockLevels.reduce(
      (sum, level) => sum + Number(level.reserved),
      0,
    );

    const stockStatusCounts = warehouseStockLevels.reduce(
      (acc, level) => {
        const available = Number(level.quantity) - Number(level.reserved);
        const threshold = Number(level.variant.lowStockThreshold || 0);

        if (available <= 0) {
          acc.outOfStock++;
        } else if (available <= threshold) {
          acc.lowStock++;
        }
        return acc;
      },
      { lowStock: 0, outOfStock: 0 },
    );

    return NextResponse.json({
      warehouses,
      stats: {
        totalProducts,
        totalStock,
        lowStockItems: stockStatusCounts.lowStock,
        outOfStockItems: stockStatusCounts.outOfStock,
        reservedUnits,
      },
    });
  } catch (error) {
    console.error("WAREHOUSE PRODUCT STATS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load warehouse product statistics." },
      { status: 500 },
    );
  }
}
