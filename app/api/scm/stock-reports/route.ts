import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { getLocalSnapshotDate } from "@/lib/report-history";
import { getInventoryStatus } from "@/lib/stock-status";

function toCleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
    if (!access.hasAny(["stock_reports.read", "inventory.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const type = toCleanText(request.nextUrl.searchParams.get("type"), 20).toLowerCase();
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const warehouseFilter =
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null;
    const hasGlobalScope =
      access.isSuperAdmin ||
      access.hasGlobal("stock_reports.read") ||
      access.hasGlobal("inventory.manage");

    if (!hasGlobalScope && warehouseFilter === null && access.warehouseIds.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (warehouseFilter !== null && !access.canAccessWarehouse(warehouseFilter)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (type === "aging") {
      const stockLevels = await prisma.stockLevel.findMany({
        where:
          warehouseFilter !== null
            ? { warehouseId: warehouseFilter, quantity: { gt: 0 } }
            : !hasGlobalScope && access.warehouseIds.length > 0
              ? { warehouseId: { in: access.warehouseIds }, quantity: { gt: 0 } }
              : { quantity: { gt: 0 } },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          variant: {
            select: {
              id: true,
              sku: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ warehouseId: "asc" }, { productVariantId: "asc" }],
      });

      const logGroups = await prisma.inventoryLog.groupBy({
        by: ["variantId", "warehouseId"],
        _max: { createdAt: true },
        where: {
          variantId: { not: null },
          warehouseId: warehouseFilter !== null ? warehouseFilter : undefined,
        },
      });

      const lastMovement = new Map<string, Date>();
      for (const entry of logGroups) {
        if (!entry.variantId) continue;
        const key = `${entry.warehouseId ?? "global"}:${entry.variantId}`;
        if (entry._max.createdAt) {
          lastMovement.set(key, entry._max.createdAt);
        }
      }

      const now = new Date();
      const rows = stockLevels.map((level) => {
        const key = `${level.warehouseId ?? "global"}:${level.productVariantId}`;
        const last = lastMovement.get(key) || null;
        const ageDays = last ? Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86400000)) : null;
        return {
          warehouse: level.warehouse,
          variant: level.variant,
          quantity: Number(level.quantity || 0),
          reserved: Number(level.reserved || 0),
          available: Math.max(0, Number(level.quantity || 0) - Number(level.reserved || 0)),
          lastMovement: last ? last.toISOString() : null,
          ageDays,
        };
      });

      return NextResponse.json({
        type: "aging",
        rows,
      });
    }

    if (type === "monthly") {
      const from = parseDate(request.nextUrl.searchParams.get("from"));
      const to = parseDate(request.nextUrl.searchParams.get("to"));
      if (!from || !to) {
        return NextResponse.json({ error: "From/To dates are required." }, { status: 400 });
      }
      const start = getLocalSnapshotDate(from);
      const end = getLocalSnapshotDate(to);

      const where: Prisma.InventoryWarehouseDailySnapshotWhereInput = {
        snapshotDate: { gte: start, lte: end },
      };
      if (warehouseFilter !== null) {
        where.warehouseId = warehouseFilter;
      } else if (!hasGlobalScope && access.warehouseIds.length > 0) {
        where.warehouseId = { in: access.warehouseIds };
      }

      const summaries = await prisma.inventoryWarehouseDailySnapshot.groupBy({
        by: ["warehouseId"],
        where,
        _avg: { quantity: true, reserved: true, available: true },
        _sum: { quantity: true, reserved: true, available: true },
        _count: { warehouseId: true },
      });

      const warehouseIds = summaries.map((row) => row.warehouseId);
      const warehouses = await prisma.warehouse.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, name: true, code: true },
      });
      const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

      const endSnapshots = await prisma.inventoryWarehouseDailySnapshot.findMany({
        where,
        orderBy: [{ snapshotDate: "desc" }],
        distinct: ["warehouseId"],
        select: { warehouseId: true, snapshotDate: true, quantity: true, reserved: true, available: true },
      });
      const endMap = new Map(endSnapshots.map((row) => [row.warehouseId, row]));

      const rows = summaries.map((row) => {
        const endRow = endMap.get(row.warehouseId);
        return {
          warehouse: warehouseMap.get(row.warehouseId) || null,
          daysTracked: row._count.warehouseId,
          avgQuantity: Number(row._avg.quantity || 0),
          avgReserved: Number(row._avg.reserved || 0),
          avgAvailable: Number(row._avg.available || 0),
          endQuantity: Number(endRow?.quantity || 0),
          endReserved: Number(endRow?.reserved || 0),
          endAvailable: Number(endRow?.available || 0),
          endDate: endRow?.snapshotDate?.toISOString() || null,
        };
      });

      return NextResponse.json({
        type: "monthly",
        range: { from: start.toISOString(), to: end.toISOString() },
        rows,
      });
    }

    const dateParam = parseDate(request.nextUrl.searchParams.get("date"));
    const snapshotDate = getLocalSnapshotDate(dateParam ?? new Date());

    const whereSnapshot: Prisma.InventoryWarehouseDailySnapshotWhereInput = {
      snapshotDate,
    };
    if (warehouseFilter !== null) {
      whereSnapshot.warehouseId = warehouseFilter;
    } else if (!hasGlobalScope && access.warehouseIds.length > 0) {
      whereSnapshot.warehouseId = { in: access.warehouseIds };
    }

    const snapshots = await prisma.inventoryWarehouseDailySnapshot.findMany({
      where: whereSnapshot,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            lowStockThreshold: true,
            product: { select: { id: true, name: true, lowStockThreshold: true } },
          },
        },
      },
    });

    const usedSnapshot = snapshots.length > 0;
    const rows = usedSnapshot
      ? snapshots.map((row) => {
          const threshold = Number(row.variant.lowStockThreshold || row.variant.product.lowStockThreshold || 0);
          return {
            warehouse: row.warehouse,
            variant: {
              id: row.variant.id,
              sku: row.variant.sku,
              product: row.variant.product,
            },
            quantity: Number(row.quantity || 0),
            reserved: Number(row.reserved || 0),
            available: Number(row.available || 0),
            status: getInventoryStatus(Number(row.quantity || 0), threshold),
          };
        })
      : (
          await prisma.stockLevel.findMany({
            where:
              warehouseFilter !== null
                ? { warehouseId: warehouseFilter }
                : !hasGlobalScope && access.warehouseIds.length > 0
                  ? { warehouseId: { in: access.warehouseIds } }
                  : undefined,
            include: {
              warehouse: { select: { id: true, name: true, code: true } },
              variant: {
                select: {
                  id: true,
                  sku: true,
                  lowStockThreshold: true,
                  product: { select: { id: true, name: true, lowStockThreshold: true } },
                },
              },
            },
          })
        ).map((row) => {
          const threshold = Number(row.variant.lowStockThreshold || row.variant.product.lowStockThreshold || 0);
          const available = Math.max(0, Number(row.quantity || 0) - Number(row.reserved || 0));
          return {
            warehouse: row.warehouse,
            variant: {
              id: row.variant.id,
              sku: row.variant.sku,
              product: row.variant.product,
            },
            quantity: Number(row.quantity || 0),
            reserved: Number(row.reserved || 0),
            available,
            status: getInventoryStatus(Number(row.quantity || 0), threshold),
          };
        });

    const summary = rows.reduce(
      (acc, row) => {
        const key = String(row.warehouse?.id ?? "0");
        if (!acc.byWarehouse[key]) {
          acc.byWarehouse[key] = {
            warehouse: row.warehouse,
            quantity: 0,
            reserved: 0,
            available: 0,
          };
        }
        acc.byWarehouse[key].quantity += Number(row.quantity || 0);
        acc.byWarehouse[key].reserved += Number(row.reserved || 0);
        acc.byWarehouse[key].available += Number(row.available || 0);
        acc.total.quantity += Number(row.quantity || 0);
        acc.total.reserved += Number(row.reserved || 0);
        acc.total.available += Number(row.available || 0);
        return acc;
      },
      {
        total: { quantity: 0, reserved: 0, available: 0 },
        byWarehouse: {} as Record<
          string,
          {
            warehouse: { id: number; name: string; code: string } | null;
            quantity: number;
            reserved: number;
            available: number;
          }
        >,
      },
    );

    return NextResponse.json({
      type: "daily",
      date: snapshotDate.toISOString(),
      usedSnapshot,
      summary,
      rows,
    });
  } catch (error) {
    console.error("STOCK REPORTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load stock reports." },
      { status: 500 },
    );
  }
}
