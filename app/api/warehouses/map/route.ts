import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { WarehouseMapData } from "@/lib/types/warehouse";

/* =========================
   GET WAREHOUSES FOR MAP
========================= */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !access.hasAny([
        "settings.warehouse.manage",
        "inventory.manage",
        "shipments.manage",
        "orders.read_all",
        "dashboard.read",
      ])
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouses = await prisma.warehouse.findMany({
      where:
        access.isSuperAdmin ||
        access.hasGlobal("settings.warehouse.manage") ||
        access.hasGlobal("inventory.manage") ||
        access.hasGlobal("shipments.manage") ||
        access.hasGlobal("orders.read_all") ||
        access.hasGlobal("dashboard.read")
          ? undefined
          : access.warehouseIds.length > 0
            ? { id: { in: access.warehouseIds } }
            : { id: -1 },
      select: {
        id: true,
        name: true,
        code: true,
        district: true,
        area: true,
        latitude: true,
        longitude: true,
        mapLabel: true,
        geoFence: true,
        coverageRadiusKm: true,
        isMapEnabled: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    // Filter only warehouses with valid coordinates and map enabled
    const mapData: WarehouseMapData[] = warehouses
      .filter(w => w.isMapEnabled && w.latitude && w.longitude)
      .map(w => ({
        id: w.id,
        name: w.name,
        code: w.code,
        district: w.district,
        area: w.area,
        latitude: w.latitude,
        longitude: w.longitude,
        mapLabel: w.mapLabel,
        geoFence: w.geoFence,
        coverageRadiusKm: w.coverageRadiusKm,
        isMapEnabled: w.isMapEnabled,
      }));

    return NextResponse.json(mapData);
  } catch (error) {
    console.error("GET WAREHOUSES MAP ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch warehouse map data" },
      { status: 500 },
    );
  }
}
