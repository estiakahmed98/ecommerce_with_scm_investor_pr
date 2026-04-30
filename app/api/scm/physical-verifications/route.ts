import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

const VERIFICATION_READ_PERMISSIONS = [
  "physical_verifications.read",
  "physical_verifications.manage",
  "physical_verifications.approve",
] as const;

function toCleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadVerifications(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...VERIFICATION_READ_PERMISSIONS]);
}

function hasGlobalVerificationScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return VERIFICATION_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
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
    if (!canReadVerifications(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const statusFilter = toCleanText(request.nextUrl.searchParams.get("status"), 40).toUpperCase();

    const where: Prisma.InventoryVerificationWhereInput = {};
    if (statusFilter && ["DRAFT", "SUBMITTED", "COMMITTEE_REVIEW", "APPROVED", "REJECTED", "CLOSED"].includes(statusFilter)) {
      where.status = statusFilter as any;
    }

    const globalScope = hasGlobalVerificationScope(access);
    if (globalScope) {
      if (Number.isInteger(warehouseId) && warehouseId > 0) {
        where.warehouseId = warehouseId;
      }
    } else if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json([]);
      }
      where.warehouseId = warehouseId;
    } else if (access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    } else {
      return NextResponse.json([]);
    }

    const verifications = await prisma.inventoryVerification.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        committeeMembers: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        lines: {
          include: {
            productVariant: {
              select: {
                id: true,
                sku: true,
                product: { select: { id: true, name: true } },
              },
            },
            bin: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: "asc" },
        },
        approvalEvents: {
          include: {
            actedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: [{ actedAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json(verifications);
  } catch (error) {
    console.error("PHYSICAL VERIFICATION GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load verifications." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny(["physical_verifications.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      warehouseId?: unknown;
      frequency?: unknown;
      periodStart?: unknown;
      periodEnd?: unknown;
      note?: unknown;
      committeeUserIds?: unknown;
      lines?: Array<{
        productVariantId?: unknown;
        binId?: unknown;
        systemQty?: unknown;
        countedQty?: unknown;
        note?: unknown;
      }>;
    };

    const warehouseId = Number(body.warehouseId);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
    }
    if (!access.canAccessWarehouse(warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const frequency = toCleanText(body.frequency, 20).toUpperCase();
    if (!frequency || !["MONTHLY", "QUARTERLY", "ANNUAL"].includes(frequency)) {
      return NextResponse.json({ error: "Frequency is invalid." }, { status: 400 });
    }

    const periodStart = new Date(String(body.periodStart || ""));
    const periodEnd = new Date(String(body.periodEnd || ""));
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: "Period dates are invalid." }, { status: 400 });
    }

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) {
      return NextResponse.json({ error: "At least one line is required." }, { status: 400 });
    }

    const committeeUserIds = Array.isArray(body.committeeUserIds)
      ? body.committeeUserIds.map((id) => String(id))
      : [];

    const created = await prisma.$transaction(async (tx) => {
      const verification = await tx.inventoryVerification.create({
        data: {
          warehouseId,
          frequency: frequency as any,
          periodStart,
          periodEnd,
          note: toCleanText(body.note, 500) || null,
          createdById: access.userId,
          committeeMembers: {
            create: committeeUserIds.map((userId) => ({ userId })),
          },
          lines: {
            create: lines.map((line) => {
              const systemQty = Number(line.systemQty || 0);
              const countedQty = Number(line.countedQty || 0);
              return {
                productVariantId: Number(line.productVariantId),
                binId: line.binId ? Number(line.binId) : null,
                systemQty,
                countedQty,
                variance: countedQty - systemQty,
                note: toCleanText(line.note, 255) || null,
              };
            }),
          },
        },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          lines: true,
        },
      });

      await tx.inventoryVerificationApprovalEvent.create({
        data: {
          verificationId: verification.id,
          stage: "SUBMISSION",
          decision: "APPROVED",
          actedById: access.userId,
          note: "Draft created",
        },
      });

      return verification;
    });

    await logActivity({
      action: "create",
      entity: "inventory_verification",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created physical verification for warehouse ${created.warehouseId}`,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("PHYSICAL VERIFICATION POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create verification." },
      { status: 500 },
    );
  }
}
