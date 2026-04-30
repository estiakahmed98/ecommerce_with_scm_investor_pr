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
    const rejectionReason =
      typeof body.rejectionReason === "string" && body.rejectionReason.trim().length > 0
        ? body.rejectionReason.trim()
        : typeof body.reason === "string" && body.reason.trim().length > 0
          ? body.reason.trim()
          : "";

    if (!rejectionReason) {
      return NextResponse.json(
        { success: false, message: "Rejection reason is required" },
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
        nextStatus: DeliveryAssignmentStatus.REJECTED,
        actorUserId: access.userId,
        rejectionReason,
        note: rejectionReason,
      }),
    );

    await logActivity({
      action: "reject_delivery_assignment",
      entity: "delivery_assignment",
      entityId: id,
      access,
      request,
      metadata: {
        message: `Delivery assignment ${id} rejected`,
      },
      before: {
        status: existingAssignment.status,
      },
      after: {
        status: updatedAssignment?.status ?? DeliveryAssignmentStatus.REJECTED,
        rejectionReason,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Delivery rejected successfully",
      data: updatedAssignment,
    });
  } catch (error) {
    console.error("DELIVERY_ASSIGNMENT_REJECT_ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to reject delivery",
      },
      { status: 500 },
    );
  }
}
