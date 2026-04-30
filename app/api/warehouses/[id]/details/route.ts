import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

const DETAILS_PERMISSIONS = [
  "settings.warehouse.manage",
  "inventory.manage",
  "shipments.manage",
  "orders.read_all",
  "dashboard.read",
] as const;

function buildDeliveredShipmentWhere(
  warehouseId: number,
  dateFrom: string | null,
  dateTo: string | null,
) {
  return {
    warehouseId,
    status: "DELIVERED" as const,
    ...(dateFrom || dateTo
      ? {
          deliveredAt: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        }
      : {}),
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny([...DETAILS_PERMISSIONS])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const warehouseId = Number(idParam);
    if (!warehouseId || Number.isNaN(warehouseId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const hasGlobalScope =
      access.isSuperAdmin ||
      DETAILS_PERMISSIONS.some((permission) => access.hasGlobal(permission));

    if (!hasGlobalScope && !access.warehouseIds.includes(warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "20")));
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const productType = searchParams.get("productType") || "";
    const sortBy = searchParams.get("sortBy") || "name";
    const sortOrder = searchParams.get("sortOrder") || "asc";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const deliveredShipmentWhere = buildDeliveredShipmentWhere(
      warehouseId,
      dateFrom,
      dateTo,
    );

    const [warehouse, shipmentCounts, shipmentDeliveredToday, deliveredOrders, deliveryMenCount, assignmentCounts, staffCount, categories] =
      await Promise.all([
        prisma.warehouse.findUnique({
          where: { id: warehouseId },
        }),
        prisma.shipment.groupBy({
          by: ["status"],
          where: { 
            warehouseId,
            ...(dateFrom || dateTo ? {
              createdAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
              },
            } : {}),
          },
          _count: { _all: true },
        }),
        prisma.shipment.count({
          where: {
            warehouseId,
            status: "DELIVERED",
            deliveredAt: { gte: todayStart },
            ...(dateFrom || dateTo
              ? {
                  deliveredAt: {
                    gte: new Date(
                      new Date(dateFrom ?? todayStart).setHours(0, 0, 0, 0),
                    ),
                    ...(dateTo && { lte: new Date(dateTo) }),
                  },
                }
              : {}),
          },
        }),
        prisma.shipment.findMany({
          where: deliveredShipmentWhere,
          select: {
            order: {
              select: {
                orderItems: {
                  select: {
                    quantity: true,
                    productId: true,
                    variantId: true,
                  },
                },
              },
            },
          },
        }),
        prisma.deliveryManProfile.count({
          where: { warehouseId },
        }),
        prisma.deliveryAssignment.groupBy({
          by: ["status"],
          where: { 
            warehouseId,
            ...(dateFrom || dateTo ? {
              createdAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
              },
            } : {}),
          },
          _count: { _all: true },
        }),
        prisma.warehouseMembership.count({
          where: { warehouseId },
        }),
        prisma.category.findMany({
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
        }),
      ]);

    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found" }, { status: 404 });
    }

    // Build where clause for stock levels with filters
    const whereClause: any = { warehouseId };
    if (search) {
      whereClause.variant = {
        product: {
          name: { contains: search, mode: "insensitive" },
        },
      };
    }
    if (category) {
      whereClause.variant = {
        ...whereClause.variant,
        product: {
          ...whereClause.variant?.product,
          categoryId: Number(category),
        },
      };
    }
    if (productType) {
      whereClause.variant = {
        ...whereClause.variant,
        product: {
          ...whereClause.variant?.product,
          type: productType,
        },
      };
    }

    // Get total count for pagination
    const totalCount = await prisma.stockLevel.count({ where: whereClause });

    // Build sorting
    const orderBy: any = {};
    if (sortBy === "name") {
      orderBy.variant = { product: { name: sortOrder } };
    } else if (sortBy === "quantity") {
      orderBy.quantity = sortOrder;
    } else if (sortBy === "available") {
      orderBy.quantity = sortOrder;
    } else if (sortBy === "sold") {
      // We'll handle sold sorting separately
    } else {
      orderBy.updatedAt = sortOrder;
    }

    // Get paginated stock levels
    const stockLevels = await prisma.stockLevel.findMany({
      where: whereClause,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        quantity: true,
        reserved: true,
        updatedAt: true,
        variant: {
          select: {
            id: true,
            sku: true,
            lowStockThreshold: true,
            product: {
              select: {
                id: true,
                name: true,
                type: true,
                categoryId: true,
                category: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    const variantIdsByProduct = new Map<number, number[]>();
    for (const level of stockLevels) {
      const productId = level.variant.product.id;
      const existing = variantIdsByProduct.get(productId) ?? [];
      existing.push(level.variant.id);
      variantIdsByProduct.set(productId, existing);
    }

    const soldUnitsByVariant = new Map<number, number>();

    for (const shipment of deliveredOrders) {
      for (const item of shipment.order.orderItems) {
        const matchedVariantId =
          item.variantId ??
          (() => {
            const variants = variantIdsByProduct.get(item.productId) ?? [];
            return variants.length === 1 ? variants[0] : null;
          })();

        if (!matchedVariantId) {
          continue;
        }

        soldUnitsByVariant.set(
          matchedVariantId,
          (soldUnitsByVariant.get(matchedVariantId) || 0) +
            Number(item.quantity || 0),
        );
      }
    }

    // Apply sold filter if specified
    const soldFilter = searchParams.get("soldFilter");
    let filteredStockLevels = stockLevels;
    
    if (soldFilter === "best-selling") {
      const sortedBySold = [...stockLevels].sort((a, b) => {
        const soldA = soldUnitsByVariant.get(a.variant.id) || 0;
        const soldB = soldUnitsByVariant.get(b.variant.id) || 0;
        return soldB - soldA;
      });
      
      const topCount = Math.max(1, Math.floor(sortedBySold.length * 0.2));
      const topVariantIds = new Set(sortedBySold.slice(0, topCount).map((level) => level.variant.id));
      filteredStockLevels = stockLevels.filter((level) => topVariantIds.has(level.variant.id));
      
    } else if (soldFilter === "low-selling") {
      const sortedBySold = [...stockLevels].sort((a, b) => {
        const soldA = soldUnitsByVariant.get(a.variant.id) || 0;
        const soldB = soldUnitsByVariant.get(b.variant.id) || 0;
        return soldA - soldB;
      });
      
      const withSales = sortedBySold.filter(
        (level) => (soldUnitsByVariant.get(level.variant.id) || 0) > 0,
      );
      const bottomCount = Math.max(1, Math.floor(withSales.length * 0.2));
      const bottomVariantIds = new Set(withSales.slice(0, bottomCount).map((level) => level.variant.id));
      filteredStockLevels = stockLevels.filter((level) => bottomVariantIds.has(level.variant.id));
    }

    // Sort by sold units if needed
    let sortedStockLevels = filteredStockLevels;
    if (sortBy === "sold") {
      sortedStockLevels = [...filteredStockLevels].sort((a, b) => {
        const soldA = soldUnitsByVariant.get(a.variant.id) || 0;
        const soldB = soldUnitsByVariant.get(b.variant.id) || 0;
        return sortOrder === "desc" ? soldB - soldA : soldA - soldB;
      });
    }

    const shipmentStats = shipmentCounts.reduce(
      (acc, row) => {
        acc.total += row._count._all;
        acc.byStatus[row.status] = row._count._all;
        return acc;
      },
      { total: 0, byStatus: {} as Record<string, number> },
    );

    const assignmentStats = assignmentCounts.reduce(
      (acc, row) => {
        acc.total += row._count._all;
        acc.byStatus[row.status] = row._count._all;
        return acc;
      },
      { total: 0, byStatus: {} as Record<string, number> },
    );

    const totalUnits = sortedStockLevels.reduce(
      (sum, level) => sum + Number(level.quantity),
      0,
    );

    const reservedUnits = sortedStockLevels.reduce(
      (sum, level) => sum + Number(level.reserved),
      0,
    );

    const lowStockItems = sortedStockLevels.filter((level) => {
      const available = Number(level.quantity) - Number(level.reserved);
      const threshold = Number(level.variant.lowStockThreshold || 0);
      return available > 0 && available <= threshold;
    }).length;

    const outOfStockItems = sortedStockLevels.filter(
      (level) => Number(level.quantity) - Number(level.reserved) <= 0,
    ).length;

    const soldUnits = sortedStockLevels.reduce(
      (sum, level) => sum + (soldUnitsByVariant.get(level.variant.id) || 0),
      0,
    );

    return NextResponse.json({
      warehouse,
      summary: {
        totalUnits,
        reservedUnits,
        availableUnits: totalUnits - reservedUnits,
        productVariants: totalCount,
        distinctProducts: new Set(sortedStockLevels.map((level) => level.variant.product.id)).size,
        lowStockItems,
        outOfStockItems,
        shipments: shipmentStats,
        deliveredToday: shipmentDeliveredToday,
        soldUnits,
        deliveryMen: {
          count: deliveryMenCount,
        },
        deliveryAssignments: assignmentStats,
        staff: {
          count: staffCount,
        },
      },
      stockLevels: sortedStockLevels.map((level) => ({
        id: level.id,
        quantity: Number(level.quantity),
        reserved: Number(level.reserved),
        available: Number(level.quantity) - Number(level.reserved),
        updatedAt: level.updatedAt,
        variant: level.variant,
        soldUnits: soldUnitsByVariant.get(level.variant.id) || 0,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      filters: {
        categories,
      },
    });
  } catch (error) {
    console.error("WAREHOUSE DETAILS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load warehouse details" },
      { status: 500 },
    );
  }
}
