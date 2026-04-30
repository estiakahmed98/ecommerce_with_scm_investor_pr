import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

function toWarehouseLogSnapshot(warehouse: {
  id?: number;
  name: string;
  code: string;
  isDefault: boolean;
  country?: string | null;
  division?: string | null;
  district?: string | null;
  area?: string | null;
  postCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  mapLabel?: string | null;
  coverageRadiusKm?: number | null;
  locationNote?: string | null;
  isMapEnabled?: boolean | null;
  address?: unknown;
}) {
  return {
    name: warehouse.name,
    code: warehouse.code,
    isDefault: warehouse.isDefault,
    country: warehouse.country ?? null,
    division: warehouse.division ?? null,
    district: warehouse.district ?? null,
    area: warehouse.area ?? null,
    postCode: warehouse.postCode ?? null,
    latitude: warehouse.latitude ?? null,
    longitude: warehouse.longitude ?? null,
    mapLabel: warehouse.mapLabel ?? null,
    coverageRadiusKm: warehouse.coverageRadiusKm ?? null,
    locationNote: warehouse.locationNote ?? null,
    isMapEnabled: warehouse.isMapEnabled ?? null,
    address: warehouse.address ?? null,
  };
}

/* =========================
   GET WAREHOUSES
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
        "purchase_requisitions.read",
        "purchase_requisitions.manage",
        "purchase_requisitions.approve",
        "purchase_orders.read",
        "purchase_orders.manage",
        "purchase_orders.approve",
        "purchase_orders.approve_manager",
        "purchase_orders.approve_committee",
        "purchase_orders.approve_final",
        "goods_receipts.read",
        "goods_receipts.manage",
        "supplier_returns.read",
        "supplier_returns.manage",
        "supplier_returns.approve",
        "replenishment.read",
        "replenishment.manage",
        "warehouse_transfers.read",
        "warehouse_transfers.manage",
        "warehouse_transfers.approve",
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
        access.hasGlobal("dashboard.read") ||
        access.hasGlobal("purchase_requisitions.read") ||
        access.hasGlobal("purchase_requisitions.manage") ||
        access.hasGlobal("purchase_requisitions.approve") ||
        access.hasGlobal("purchase_orders.read") ||
        access.hasGlobal("purchase_orders.manage") ||
        access.hasGlobal("purchase_orders.approve") ||
        access.hasGlobal("purchase_orders.approve_manager") ||
        access.hasGlobal("purchase_orders.approve_committee") ||
        access.hasGlobal("purchase_orders.approve_final") ||
        access.hasGlobal("goods_receipts.read") ||
        access.hasGlobal("goods_receipts.manage") ||
        access.hasGlobal("supplier_returns.read") ||
        access.hasGlobal("supplier_returns.manage") ||
        access.hasGlobal("supplier_returns.approve") ||
        access.hasGlobal("replenishment.read") ||
        access.hasGlobal("replenishment.manage") ||
        access.hasGlobal("warehouse_transfers.read") ||
        access.hasGlobal("warehouse_transfers.manage") ||
        access.hasGlobal("warehouse_transfers.approve")
          ? undefined
          : access.warehouseIds.length > 0
            ? { id: { in: access.warehouseIds } }
            : { id: -1 },
      orderBy: [{ isDefault: "desc" }, { id: "desc" }],
    });

    return NextResponse.json(warehouses);
  } catch (error) {
    console.error("GET WAREHOUSES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch warehouses" },
      { status: 500 },
    );
  }
}

/* =========================
   CREATE WAREHOUSE
========================= */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("settings.warehouse.manage") && !access.has("settings.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const name = String(body.name || "").trim();
    const code = String(body.code || "")
      .trim()
      .toUpperCase();
    const isDefault = Boolean(body.isDefault);

    if (!name || !code) {
      return NextResponse.json(
        { error: "Name and Code are required" },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.warehouse.updateMany({
          data: { isDefault: false },
        });
      }

      return tx.warehouse.create({
        data: {
          name,
          code,
          isDefault,
          address: body.address ?? null,
          // Location fields
          country: body.country || "BD",
          division: body.division || null,
          district: body.district || null,
          area: body.area || null,
          postCode: body.postCode || null,
          latitude: body.latitude ? parseFloat(body.latitude) : null,
          longitude: body.longitude ? parseFloat(body.longitude) : null,
          mapLabel: body.mapLabel || null,
          coverageRadiusKm: body.coverageRadiusKm ? parseFloat(body.coverageRadiusKm) : null,
          locationNote: body.locationNote || null,
          isMapEnabled: body.isMapEnabled !== undefined ? Boolean(body.isMapEnabled) : true,
        },
      });
    });

    await logActivity({
      action: "create",
      entity: "warehouse",
      entityId: created.id,
      access,
      request: req,
      metadata: {
        message: `Created warehouse ${created.name} (${created.code})`,
      },
      after: toWarehouseLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("POST WAREHOUSE ERROR:", error);
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Warehouse code already exists" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create warehouse" },
      { status: 500 },
    );
  }
}

