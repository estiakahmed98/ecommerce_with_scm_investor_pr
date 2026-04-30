import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { DeliveryAssignmentStatus } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import {
  buildDeliveryAssignmentSummary,
  canManageDeliveryAssignmentWarehouse,
  createDeliveryAssignments,
  deliveryAssignmentDetailsInclude,
  getDeliveryManProfileForUser,
  hasDeliveryAssignmentManagementAccess,
} from "@/lib/delivery-assignments";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

function hasGlobalDeliveryAssignmentManagementAccess(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return (
    access.hasGlobal("delivery-men.manage") ||
    access.hasGlobal("logistics.manage") ||
    access.hasGlobal("shipments.manage")
  );
}

function buildStatusSummary(
  grouped: Array<{
    status: DeliveryAssignmentStatus;
    _count: {
      _all: number;
    };
  }>,
) {
  const counts = Object.fromEntries(
    grouped.map((item) => [item.status, item._count._all]),
  ) as Partial<Record<DeliveryAssignmentStatus, number>>;

  return buildDeliveryAssignmentSummary(
    (Object.entries(counts) as Array<[DeliveryAssignmentStatus, number]>).flatMap(
      ([status, total]) =>
        Array.from({ length: total }, () => ({
          status,
        })),
    ),
  );
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const page = Math.max(Number(searchParams.get("page") || "1"), 1);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "50"), 1), 200);
    const skip = (page - 1) * limit;
    const currentOnly = searchParams.get("currentOnly") === "true";
    const requestedWarehouseId = Number(searchParams.get("warehouseId") || "");
    const requestedStatus = searchParams.get("status");
    const shipmentId = Number(searchParams.get("shipmentId") || "");
    const orderId = Number(searchParams.get("orderId") || "");
    const requestedDeliveryManProfileId =
      searchParams.get("deliveryManProfileId") || undefined;

    const where: Record<string, unknown> = {};
    const isMineScope = scope === "mine" || !canManage;

    if (currentOnly) {
      where.isCurrent = true;
    }

    if (requestedStatus) {
      const statuses = requestedStatus
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean) as DeliveryAssignmentStatus[];
      if (statuses.length > 0) {
        where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
      }
    }

    if (!Number.isNaN(shipmentId) && shipmentId > 0) {
      where.shipmentId = shipmentId;
    }

    if (!Number.isNaN(orderId) && orderId > 0) {
      where.orderId = orderId;
    }

    let deliveryManProfileId = requestedDeliveryManProfileId;

    if (isMineScope) {
      const profile = await getDeliveryManProfileForUser(prisma, access.userId);
      if (!profile) {
        return NextResponse.json({
          success: true,
          data: {
            assignments: [],
            summary: {
              assigned: 0,
              accepted: 0,
              rejected: 0,
              pickedFromWarehouse: 0,
              inTransit: 0,
              delivered: 0,
            },
            pagination: {
              page,
              limit,
              total: 0,
              pages: 0,
            },
          },
        });
      }

      deliveryManProfileId = profile.id;
    }

    if (deliveryManProfileId) {
      where.deliveryManProfileId = deliveryManProfileId;
    }

    if (!isMineScope) {
      const hasGlobalScope = hasGlobalDeliveryAssignmentManagementAccess(access);
      if (!Number.isNaN(requestedWarehouseId) && requestedWarehouseId > 0) {
        if (!canManageDeliveryAssignmentWarehouse(access, requestedWarehouseId)) {
          return NextResponse.json(
            { success: false, message: "Forbidden" },
            { status: 403 },
          );
        }
        where.warehouseId = requestedWarehouseId;
      } else if (!hasGlobalScope) {
        const scopedWarehouseIds = access.warehouseIds.filter((warehouseId) =>
          canManageDeliveryAssignmentWarehouse(access, warehouseId),
        );
        if (scopedWarehouseIds.length === 0) {
          return NextResponse.json({
            success: true,
            data: {
              assignments: [],
              summary: {
                assigned: 0,
                accepted: 0,
                rejected: 0,
                pickedFromWarehouse: 0,
                inTransit: 0,
                delivered: 0,
              },
              pagination: {
                page,
                limit,
                total: 0,
                pages: 0,
              },
            },
          });
        }
        where.warehouseId = {
          in: scopedWarehouseIds,
        };
      }
    }

    const [assignments, total, grouped] = await Promise.all([
      prisma.deliveryAssignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          {
            assignedAt: "desc",
          },
        ],
        include: deliveryAssignmentDetailsInclude,
      }),
      prisma.deliveryAssignment.count({ where }),
      prisma.deliveryAssignment.groupBy({
        by: ["status"],
        where,
        _count: {
          _all: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        assignments,
        summary: buildStatusSummary(grouped),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("DELIVERY_ASSIGNMENTS_GET_ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to load delivery assignments",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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

    if (!hasDeliveryAssignmentManagementAccess(access)) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const shipmentIds = Array.isArray(body.shipmentIds)
      ? body.shipmentIds.map((value: unknown) => Number(value)).filter((value: number) => value > 0)
      : body.shipmentId
        ? [Number(body.shipmentId)]
        : [];
    const deliveryManProfileId =
      typeof body.deliveryManProfileId === "string"
        ? body.deliveryManProfileId
        : "";
    const note =
      typeof body.note === "string" && body.note.trim().length > 0
        ? body.note.trim()
        : null;

    if (!deliveryManProfileId || shipmentIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "deliveryManProfileId and at least one shipment are required",
        },
        { status: 400 },
      );
    }

    const deliveryMan = await prisma.deliveryManProfile.findUnique({
      where: {
        id: deliveryManProfileId,
      },
      select: {
        id: true,
        warehouseId: true,
        fullName: true,
      },
    });

    if (!deliveryMan) {
      return NextResponse.json(
        { success: false, message: "Delivery man not found" },
        { status: 404 },
      );
    }

    if (!canManageDeliveryAssignmentWarehouse(access, deliveryMan.warehouseId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    const shipments = await prisma.shipment.findMany({
      where: {
        id: {
          in: shipmentIds,
        },
      },
      select: {
        id: true,
        warehouseId: true,
      },
    });

    if (shipments.length !== shipmentIds.length) {
      return NextResponse.json(
        { success: false, message: "One or more shipments could not be found" },
        { status: 404 },
      );
    }

    const inaccessibleShipment = shipments.find((shipment) => {
      const effectiveWarehouseId = shipment.warehouseId ?? deliveryMan.warehouseId;
      return !canManageDeliveryAssignmentWarehouse(access, effectiveWarehouseId);
    });

    if (inaccessibleShipment) {
      return NextResponse.json(
        {
          success: false,
          message: `Forbidden for shipment #${inaccessibleShipment.id}`,
        },
        { status: 403 },
      );
    }

    const createdAssignments = await prisma.$transaction((tx) =>
      createDeliveryAssignments(tx, {
        shipmentIds,
        deliveryManProfileId,
        assignedById: access.userId,
        note,
      }),
    );

    await logActivity({
      action: "assign_delivery_man",
      entity: "delivery_assignment",
      entityId: createdAssignments[0]?.id ?? null,
      access,
      request,
      metadata: {
        message: `${deliveryMan.fullName} assigned to ${createdAssignments.length} shipment(s)`,
        shipmentIds,
        deliveryManProfileId,
      },
      after: {
        deliveryManProfileId,
        shipmentIds,
        createdAssignmentIds: createdAssignments.map((assignment) => assignment.id),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message:
          createdAssignments.length === 1
            ? "Delivery assigned successfully"
            : `${createdAssignments.length} deliveries assigned successfully`,
        data: createdAssignments,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("DELIVERY_ASSIGNMENTS_POST_ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to assign deliveries",
      },
      { status: 500 },
    );
  }
}
