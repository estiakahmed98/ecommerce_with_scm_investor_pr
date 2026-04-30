import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const GLOBAL_WAREHOUSE_DASHBOARD_PERMISSIONS = [
  "dashboard.read",
  "inventory.manage",
  "shipments.manage",
  "orders.read_all",
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
    if (!access.hasAny([...GLOBAL_WAREHOUSE_DASHBOARD_PERMISSIONS])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedWarehouseIds = [...new Set(
      searchParams
        .getAll("warehouseId")
        .flatMap((value) => value.split(","))
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    )];
    const hasRequestedWarehouses = requestedWarehouseIds.length > 0;
    const hasGlobalScope =
      access.isSuperAdmin ||
      GLOBAL_WAREHOUSE_DASHBOARD_PERMISSIONS.some((permission) => access.hasGlobal(permission));

    const accessibleWarehouseIds = hasGlobalScope
      ? (
          await prisma.warehouse.findMany({
            select: { id: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
          })
        ).map((warehouse) => warehouse.id)
      : access.warehouseIds;

    let allowedWarehouseIds = accessibleWarehouseIds;

    if (hasRequestedWarehouses) {
      if (
        !hasGlobalScope &&
        requestedWarehouseIds.some((warehouseId) => !access.warehouseIds.includes(warehouseId))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      allowedWarehouseIds = allowedWarehouseIds.filter((warehouseId) =>
        requestedWarehouseIds.includes(warehouseId),
      );
    }

    if (allowedWarehouseIds.length === 0) {
      return NextResponse.json({
        selectedWarehouseIds: [],
        warehouses: [],
        summary: {
          totalWarehouses: 0,
          totalUnits: 0,
          reservedUnits: 0,
          lowStockItems: 0,
          pendingShipments: 0,
          deliveredToday: 0,
          ordersInQueue: 0,
        },
        warehouseCards: [],
        lowStock: [],
        recentShipments: [],
        recentLogs: [],
      });
    }

    const [warehouses, stockLevels, shipments, recentLogs] = await Promise.all([
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
                },
              },
            },
          },
        },
      }),
      prisma.shipment.findMany({
        where: { warehouseId: { in: allowedWarehouseIds } },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          order: {
            select: {
              id: true,
              name: true,
              status: true,
              paymentStatus: true,
            },
          },
        },
      }),
      prisma.inventoryLog.findMany({
        where: { warehouseId: { in: allowedWarehouseIds } },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          product: {
            select: {
              id: true,
              name: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
    ]);

    const scopedWarehouses = warehouses.filter((warehouse) =>
      allowedWarehouseIds.includes(warehouse.id),
    );

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const warehouseCards = scopedWarehouses.map((warehouse) => {
      const warehouseStockLevels = stockLevels.filter((level) => level.warehouseId === warehouse.id);
      const warehouseShipments = shipments.filter((shipment) => shipment.warehouseId === warehouse.id);
      const totalUnits = warehouseStockLevels.reduce((sum, level) => sum + Number(level.quantity), 0);
      const reservedUnits = warehouseStockLevels.reduce((sum, level) => sum + Number(level.reserved), 0);
      const lowStockItems = warehouseStockLevels.filter(
        (level) =>
          Number(level.quantity) - Number(level.reserved) <=
          Number(level.variant.lowStockThreshold || 0),
      ).length;

      return {
        warehouseId: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        isDefault: warehouse.isDefault,
        totalUnits,
        reservedUnits,
        lowStockItems,
        pendingShipments: warehouseShipments.filter((shipment) =>
          ["PENDING", "ASSIGNED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(
            shipment.status,
          ),
        ).length,
        deliveredToday: warehouseShipments.filter(
          (shipment) =>
            shipment.status === "DELIVERED" &&
            shipment.deliveredAt &&
            shipment.deliveredAt >= todayStart,
        ).length,
      };
    });

    const lowStock = stockLevels
      .map((level) => {
        const available = Number(level.quantity) - Number(level.reserved);
        const threshold = Number(level.variant.lowStockThreshold || 0);
        return {
          warehouseId: level.warehouseId,
          variantId: level.variant.id,
          sku: level.variant.sku,
          productName: level.variant.product.name,
          available,
          threshold,
        };
      })
      .filter((level) => level.available <= level.threshold)
      .sort((left, right) => left.available - right.available)
      .slice(0, 10);

    return NextResponse.json({
      selectedWarehouseIds: hasRequestedWarehouses ? allowedWarehouseIds : [],
      warehouses,
      summary: {
        totalWarehouses: scopedWarehouses.length,
        totalUnits: warehouseCards.reduce((sum, card) => sum + card.totalUnits, 0),
        reservedUnits: warehouseCards.reduce((sum, card) => sum + card.reservedUnits, 0),
        lowStockItems: lowStock.length,
        pendingShipments: warehouseCards.reduce((sum, card) => sum + card.pendingShipments, 0),
        deliveredToday: warehouseCards.reduce((sum, card) => sum + card.deliveredToday, 0),
        ordersInQueue: shipments.filter((shipment) =>
          ["PENDING", "ASSIGNED"].includes(shipment.status),
        ).length,
      },
      warehouseCards,
      lowStock,
      recentShipments: shipments.map((shipment) => ({
        id: shipment.id,
        warehouseId: shipment.warehouseId,
        orderId: shipment.orderId,
        status: shipment.status,
        courier: shipment.courier,
        trackingNumber: shipment.trackingNumber,
        createdAt: shipment.createdAt,
        customerName: shipment.order?.name ?? "",
        orderStatus: shipment.order?.status ?? "",
      })),
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        createdAt: log.createdAt,
        change: log.change,
        reason: log.reason,
        productName: log.product.name,
        warehouseName: log.warehouse?.name ?? "",
        warehouseCode: log.warehouse?.code ?? "",
      })),
    });
  } catch (error) {
    console.error("WAREHOUSE DASHBOARD ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load warehouse dashboard." },
      { status: 500 },
    );
  }
}
