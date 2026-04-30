import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCourierProvider } from "@/lib/couriers";
import { appendShipmentStatusLog } from "@/lib/report-history";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const custom = request.headers.get("x-cron-secret");

  return bearer === secret || custom === secret;
}

// GET /api/cron/sync-shipments
// Schedule via Vercel cron / external scheduler.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const shipments = await prisma.shipment.findMany({
      where: {
        courierId: { not: null },
        status: {
          notIn: ["DELIVERED", "RETURNED", "CANCELLED"],
        },
      },
      include: {
        courierRef: true,
      },
      take: 200,
      orderBy: { updatedAt: "asc" },
    });

    const results = await Promise.allSettled(
      shipments.map(async (shipment) => {
        if (!shipment.courierRef) {
          throw new Error(`Shipment ${shipment.id} has no courierRef`);
        }

        const provider = getCourierProvider(shipment.courierRef);
        const tracking = await provider.getTracking(shipment.courierRef, {
          trackingNumber: shipment.trackingNumber,
          externalId: shipment.externalId,
        });

        await prisma.$transaction(async (tx) => {
          const updated = await tx.shipment.update({
            where: { id: shipment.id },
            data: {
              status: tracking.status,
              courierStatus: tracking.courierStatus,
              trackingUrl: tracking.trackingUrl || shipment.trackingUrl,
              trackingNumber: tracking.trackingNumber || shipment.trackingNumber,
              externalId: tracking.externalId || shipment.externalId,
              deliveredAt:
                tracking.status === "DELIVERED" ? new Date() : shipment.deliveredAt,
              lastSyncedAt: new Date(),
            },
          });

          await appendShipmentStatusLog(tx, {
            shipmentId: updated.id,
            fromStatus: shipment.status,
            toStatus: updated.status,
            source: "COURIER_SYNC",
          });
        });

        return {
          shipmentId: shipment.id,
          status: tracking.status,
          courierStatus: tracking.courierStatus,
        };
      }),
    );

    const success = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - success;
    const failures = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "Unknown error");

    return NextResponse.json({
      scanned: shipments.length,
      synced: success,
      failed,
      failures,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in sync-shipments cron:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
