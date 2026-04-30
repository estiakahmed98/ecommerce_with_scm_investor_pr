import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  canManageDeliveryAssignmentWarehouse,
  deliveryAssignmentDetailsInclude,
  getDeliveryManProfileForUser,
  hasDeliveryAssignmentManagementAccess,
} from "@/lib/delivery-assignments";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

export async function GET(
  _request: NextRequest,
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

    const canManage = hasDeliveryAssignmentManagementAccess(access);
    const canUseDashboard = access.has("delivery.dashboard.access");
    if (!canManage && !canUseDashboard) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const assignment = await prisma.deliveryAssignment.findUnique({
      where: {
        id,
      },
      include: deliveryAssignmentDetailsInclude,
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, message: "Delivery assignment not found" },
        { status: 404 },
      );
    }

    if (canManage) {
      if (!canManageDeliveryAssignmentWarehouse(access, assignment.warehouseId)) {
        return NextResponse.json(
          { success: false, message: "Forbidden" },
          { status: 403 },
        );
      }
    } else {
      const profile = await getDeliveryManProfileForUser(prisma, access.userId);
      if (!profile || profile.id !== assignment.deliveryManProfileId) {
        return NextResponse.json(
          { success: false, message: "Forbidden" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    console.error("DELIVERY_ASSIGNMENT_GET_ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to load delivery assignment",
      },
      { status: 500 },
    );
  }
}
