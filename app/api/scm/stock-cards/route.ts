import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const STOCK_CARD_READ_PERMISSIONS = [
  "inventory.manage",
  "material_releases.read",
  "material_releases.manage",
  "material_requests.approve_admin",
] as const;

function toCleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseDateValue(raw: string) {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function canReadStockCards(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...STOCK_CARD_READ_PERMISSIONS]);
}

function hasGlobalStockScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return STOCK_CARD_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
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
    if (!canReadStockCards(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const variantId = Number(request.nextUrl.searchParams.get("variantId") || "");
    const search = toCleanText(request.nextUrl.searchParams.get("search"), 120);
    const from = parseDateValue(toCleanText(request.nextUrl.searchParams.get("from"), 40));
    const to = parseDateValue(toCleanText(request.nextUrl.searchParams.get("to"), 40));

    const where: Prisma.StockLevelWhereInput = {};
    if (Number.isInteger(variantId) && variantId > 0) {
      where.productVariantId = variantId;
    }

    if (search) {
      where.OR = [
        { variant: { sku: { contains: search, mode: "insensitive" } } },
        {
          variant: {
            product: { name: { contains: search, mode: "insensitive" } },
          },
        },
        { warehouse: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const globalScope = hasGlobalStockScope(access);
    if (globalScope) {
      if (Number.isInteger(warehouseId) && warehouseId > 0) {
        where.warehouseId = warehouseId;
      }
    } else if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json({ summaries: [], detail: null });
      }
      where.warehouseId = warehouseId;
    } else if (access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    } else {
      return NextResponse.json({ summaries: [], detail: null });
    }

    const stockLevels = await prisma.stockLevel.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            product: {
              select: {
                id: true,
                name: true,
                inventoryItemClass: true,
                requiresAssetTag: true,
              },
            },
          },
        },
      },
      orderBy: [{ warehouseId: "asc" }, { productVariantId: "asc" }],
      take: 500,
    });

    const variantIds = Array.from(new Set(stockLevels.map((level) => level.productVariantId)));
    const warehouseIds = Array.from(new Set(stockLevels.map((level) => level.warehouseId)));

    const groupedMovements =
      variantIds.length > 0 && warehouseIds.length > 0
        ? await prisma.inventoryLog.groupBy({
            by: ["variantId", "warehouseId"],
            where: {
              variantId: { in: variantIds },
              warehouseId: { in: warehouseIds },
            },
            _max: {
              createdAt: true,
            },
          })
        : [];

    const lastMovementMap = new Map<string, Date | null>();
    for (const group of groupedMovements) {
      if (!group.variantId || !group.warehouseId) continue;
      lastMovementMap.set(`${group.warehouseId}:${group.variantId}`, group._max.createdAt ?? null);
    }

    const summaries = stockLevels.map((level) => {
      const available = Math.max(0, Number(level.quantity) - Number(level.reserved));
      return {
        warehouseId: level.warehouseId,
        warehouseName: level.warehouse.name,
        warehouseCode: level.warehouse.code,
        variantId: level.productVariantId,
        sku: level.variant.sku,
        productName: level.variant.product.name,
        inventoryItemClass: level.variant.product.inventoryItemClass,
        requiresAssetTag: level.variant.product.requiresAssetTag,
        quantity: level.quantity,
        reserved: level.reserved,
        available,
        lastMovementAt:
          lastMovementMap.get(`${level.warehouseId}:${level.productVariantId}`) ?? null,
      };
    });

    let detail: Record<string, unknown> | null = null;

    if (Number.isInteger(warehouseId) && warehouseId > 0 && Number.isInteger(variantId) && variantId > 0) {
      const selected = summaries.find(
        (item) => item.warehouseId === warehouseId && item.variantId === variantId,
      );

      if (selected) {
        const movementsWhere: Prisma.InventoryLogWhereInput = {
          warehouseId,
          variantId,
        };
        if (from || to) {
          movementsWhere.createdAt = {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          };
        }

        const [movements, openingAggregate] = await Promise.all([
          prisma.inventoryLog.findMany({
            where: movementsWhere,
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              createdAt: true,
              change: true,
              reason: true,
            },
            take: 500,
          }),
          from
            ? prisma.inventoryLog.aggregate({
                where: {
                  warehouseId,
                  variantId,
                  createdAt: { lt: from },
                },
                _sum: {
                  change: true,
                },
              })
            : Promise.resolve({ _sum: { change: 0 } }),
        ]);

        const openingBalance = Number(openingAggregate._sum.change ?? 0);
        const movementDelta = movements.reduce((sum, item) => sum + Number(item.change || 0), 0);
        const closingBalance = openingBalance + movementDelta;

        detail = {
          warehouseId: selected.warehouseId,
          warehouseName: selected.warehouseName,
          warehouseCode: selected.warehouseCode,
          variantId: selected.variantId,
          sku: selected.sku,
          productName: selected.productName,
          inventoryItemClass: selected.inventoryItemClass,
          requiresAssetTag: selected.requiresAssetTag,
          quantity: selected.quantity,
          reserved: selected.reserved,
          available: selected.available,
          openingBalance,
          movementDelta,
          closingBalance,
          movements,
        };
      }
    }

    return NextResponse.json({ summaries, detail });
  } catch (error) {
    console.error("SCM STOCK CARDS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load stock cards." },
      { status: 500 },
    );
  }
}
