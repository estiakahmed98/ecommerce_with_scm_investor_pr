import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { DeliveryAssignmentStatus } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import {
  resolveDeliveryAssignmentActor,
  transitionDeliveryAssignmentStatus,
} from "@/lib/delivery-assignments";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const UPDATABLE_DELIVERY_STATUSES = [
  DeliveryAssignmentStatus.IN_TRANSIT,
  DeliveryAssignmentStatus.OUT_FOR_DELIVERY,
  DeliveryAssignmentStatus.DELIVERED,
  DeliveryAssignmentStatus.FAILED,
  DeliveryAssignmentStatus.RETURNED,
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status =
      typeof body.status === "string"
        ? (body.status as DeliveryAssignmentStatus)
        : null;
    const note =
      typeof body.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;

    const deliveredLocationRaw =
      body && typeof body === "object" && "deliveredLocation" in body
        ? (body as { deliveredLocation?: unknown }).deliveredLocation
        : undefined;

    if (
      !status ||
      !UPDATABLE_DELIVERY_STATUSES.some((allowedStatus) => allowedStatus === status)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid delivery status update is required",
        },
        { status: 400 },
      );
    }

    const deliveredLocation =
      status === DeliveryAssignmentStatus.DELIVERED
        ? parseDeliveredLocation(deliveredLocationRaw)
        : null;

    if (status === DeliveryAssignmentStatus.DELIVERED && !deliveredLocation) {
      return NextResponse.json(
        {
          success: false,
          message: "Delivery location (latitude & longitude) is required to mark delivered",
        },
        { status: 400 },
      );
    }

    const existingAssignment = await prisma.deliveryAssignment.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        warehouseId: true,
        deliveryManProfileId: true,
        status: true,
      },
    });

    if (!existingAssignment) {
      return NextResponse.json(
        { success: false, message: "Delivery assignment not found" },
        { status: 404 },
      );
    }

    const actor = await resolveDeliveryAssignmentActor(prisma, access, existingAssignment);
    if (!actor.authorized) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    const updatedAssignment = await prisma.$transaction((tx) =>
      transitionDeliveryAssignmentStatus(tx, {
        assignmentId: id,
        nextStatus: status,
        actorUserId: access.userId,
        note,
        deliveredLocation,
      }),
    );

    await logActivity({
      action: "update_delivery_assignment_status",
      entity: "delivery_assignment",
      entityId: id,
      access,
      request,
      metadata: {
        message: `Delivery assignment ${id} marked as ${status}`,
      },
      before: {
        status: existingAssignment.status,
      },
      after: {
        status: updatedAssignment?.status ?? status,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Delivery marked as ${status.replace(/_/g, " ").toLowerCase()}`,
      data: updatedAssignment,
    });
  } catch (error) {
    console.error("DELIVERY_ASSIGNMENT_STATUS_ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update delivery status",
      },
      { status: 500 },
    );
  }
}

function parseDeliveredLocation(
  value: unknown,
): { latitude: number; longitude: number; accuracy?: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const latitude =
    typeof record.latitude === "number"
      ? record.latitude
      : typeof record.latitude === "string"
        ? Number(record.latitude)
        : Number.NaN;

  const longitude =
    typeof record.longitude === "number"
      ? record.longitude
      : typeof record.longitude === "string"
        ? Number(record.longitude)
        : Number.NaN;

  const accuracy =
    typeof record.accuracy === "number"
      ? record.accuracy
      : typeof record.accuracy === "string"
        ? Number(record.accuracy)
        : null;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy as number) ? (accuracy as number) : null,
  };
}
