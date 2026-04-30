import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const ALERT_PERMISSIONS = ["stock_alerts.read", "stock_alerts.manage"] as const;

function toCleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadAlerts(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...ALERT_PERMISSIONS]);
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
    if (!canReadAlerts(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const statusFilter = toCleanText(request.nextUrl.searchParams.get("status"), 40).toUpperCase();
    const search = toCleanText(request.nextUrl.searchParams.get("search"), 120);

    const where: Prisma.ReorderAlertWhereInput = {};
    if (statusFilter && ["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(statusFilter)) {
      where.status = statusFilter as any;
    }
    if (search) {
      where.OR = [
        { productVariant: { sku: { contains: search, mode: "insensitive" } } },
        { productVariant: { product: { name: { contains: search, mode: "insensitive" } } } },
        { warehouse: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json([]);
      }
      where.warehouseId = warehouseId;
    } else if (access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    }

    const alerts = await prisma.reorderAlert.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            sku: true,
            lowStockThreshold: true,
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error("REORDER ALERT GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load alerts." }, { status: 500 });
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
    if (!access.hasAny(["stock_alerts.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      warehouseId?: unknown;
      productVariantId?: unknown;
      note?: unknown;
    };

    const warehouseId = Number(body.warehouseId);
    const productVariantId = Number(body.productVariantId);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
    }
    if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
      return NextResponse.json({ error: "Variant is required." }, { status: 400 });
    }
    if (!access.canAccessWarehouse(warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stockLevel = await prisma.stockLevel.findUnique({
      where: {
        warehouseId_productVariantId: {
          warehouseId,
          productVariantId,
        },
      },
      select: { quantity: true, reserved: true },
    });
    const variant = await prisma.productVariant.findUnique({
      where: { id: productVariantId },
      select: {
        id: true,
        lowStockThreshold: true,
        product: { select: { id: true, lowStockThreshold: true } },
      },
    });

    if (!variant) {
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }

    const threshold = Number(variant.lowStockThreshold || variant.product.lowStockThreshold || 0);
    const available = Math.max(0, Number(stockLevel?.quantity || 0) - Number(stockLevel?.reserved || 0));
    const suggestedQty = Math.max(0, threshold * 2 - available);

    const alert = await prisma.reorderAlert.create({
      data: {
        warehouseId,
        productVariantId,
        stockOnHand: available,
        threshold,
        suggestedQty,
        note: toCleanText(body.note, 200) || null,
        createdById: access.userId,
      },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error: any) {
    console.error("REORDER ALERT POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create alert." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny(["stock_alerts.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      status?: unknown;
      note?: unknown;
    };

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Alert id is required." }, { status: 400 });
    }

    const status = toCleanText(body.status, 40).toUpperCase();
    if (!status || !["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const updated = await prisma.reorderAlert.update({
      where: { id },
      data: {
        status: status as any,
        note: body.note === undefined ? undefined : toCleanText(body.note, 200) || null,
        resolvedAt: status === "RESOLVED" ? new Date() : null,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("REORDER ALERT PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update alert." },
      { status: 500 },
    );
  }
}
