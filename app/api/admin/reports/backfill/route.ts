import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import {
  backfillOrderCostSnapshots,
  backfillShipmentStatusHistory,
  captureAllInventoryDailySnapshots,
} from "@/lib/report-backfill";

async function ensureAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  if (!access.hasAny(["reports.read", "settings.manage", "inventory.manage", "shipments.manage", "orders.update"])) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  try {
    const allowed = await ensureAccess();
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: allowed.status });
    }

    const body = await request.json().catch(() => ({}));
    const actions = Array.isArray(body?.actions) && body.actions.length
      ? body.actions
      : ["order-cost-snapshots", "shipment-status-history", "inventory-daily-snapshot"];

    const result: Record<string, unknown> = {};

    if (actions.includes("order-cost-snapshots")) {
      result.orderCostSnapshots = await backfillOrderCostSnapshots(
        Number(body?.orderCostLimit) || 500,
      );
    }

    if (actions.includes("shipment-status-history")) {
      result.shipmentStatusHistory = await backfillShipmentStatusHistory(
        Number(body?.shipmentLimit) || 300,
      );
    }

    if (actions.includes("inventory-daily-snapshot")) {
      result.inventoryDailySnapshot = await captureAllInventoryDailySnapshots(
        Number(body?.inventoryLimit) || undefined,
      );
    }

    return NextResponse.json({
      ok: true,
      actions,
      result,
    });
  } catch (error) {
    console.error("Failed to run report backfill:", error);
    return NextResponse.json(
      { error: "Failed to run report backfill" },
      { status: 500 },
    );
  }
}
