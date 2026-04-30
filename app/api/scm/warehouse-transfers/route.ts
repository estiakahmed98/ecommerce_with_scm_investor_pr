import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateWarehouseTransferNumber,
  toWarehouseTransferLogSnapshot,
  warehouseTransferInclude,
} from "@/lib/scm";

const WAREHOUSE_TRANSFER_READ_PERMISSIONS = [
  "warehouse_transfers.read",
  "warehouse_transfers.manage",
  "warehouse_transfers.approve",
] as const;

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadWarehouseTransfers(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasAny([...WAREHOUSE_TRANSFER_READ_PERMISSIONS]);
}

function hasGlobalWarehouseTransferScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return WAREHOUSE_TRANSFER_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function buildWarehouseTransferWhere(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  requestedWarehouseId: number | null,
): Prisma.WarehouseTransferWhereInput | null {
  if (hasGlobalWarehouseTransferScope(access)) {
    if (!requestedWarehouseId) return {};
    return {
      OR: [
        { sourceWarehouseId: requestedWarehouseId },
        { destinationWarehouseId: requestedWarehouseId },
      ],
    };
  }

  if (requestedWarehouseId) {
    if (!access.canAccessWarehouse(requestedWarehouseId)) {
      return null;
    }
    return {
      OR: [
        { sourceWarehouseId: requestedWarehouseId },
        { destinationWarehouseId: requestedWarehouseId },
      ],
    };
  }

  if (access.warehouseIds.length === 0) {
    return null;
  }

  return {
    OR: [
      { sourceWarehouseId: { in: access.warehouseIds } },
      { destinationWarehouseId: { in: access.warehouseIds } },
    ],
  };
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
    if (!canReadWarehouseTransfers(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const scopeWhere = buildWarehouseTransferWhere(
      access,
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
    );
    if (scopeWhere === null) {
      return NextResponse.json([]);
    }

    const filters: Prisma.WarehouseTransferWhereInput[] = [scopeWhere];
    if (status) {
      filters.push({
        status: status as Prisma.EnumWarehouseTransferStatusFilter["equals"],
      });
    }
    if (search) {
      filters.push({
        OR: [
          { transferNumber: { contains: search, mode: "insensitive" } },
          {
            sourceWarehouse: {
              name: { contains: search, mode: "insensitive" },
            },
          },
          {
            destinationWarehouse: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        ],
      });
    }

    const transfers = await prisma.warehouseTransfer.findMany({
      where: filters.length === 1 ? filters[0] : { AND: filters },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: warehouseTransferInclude,
    });

    return NextResponse.json(transfers);
  } catch (error) {
    console.error("SCM WAREHOUSE TRANSFERS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load warehouse transfers." },
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      sourceWarehouseId?: unknown;
      destinationWarehouseId?: unknown;
      requiredBy?: unknown;
      note?: unknown;
      items?: Array<{
        productVariantId?: unknown;
        quantityRequested?: unknown;
        description?: unknown;
      }>;
    };

    const sourceWarehouseId = Number(body.sourceWarehouseId);
    const destinationWarehouseId = Number(body.destinationWarehouseId);

    if (!Number.isInteger(sourceWarehouseId) || sourceWarehouseId <= 0) {
      return NextResponse.json(
        { error: "Source warehouse is required." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(destinationWarehouseId) || destinationWarehouseId <= 0) {
      return NextResponse.json(
        { error: "Destination warehouse is required." },
        { status: 400 },
      );
    }
    if (sourceWarehouseId === destinationWarehouseId) {
      return NextResponse.json(
        { error: "Source and destination warehouses must be different." },
        { status: 400 },
      );
    }
    if (!access.can("warehouse_transfers.manage", sourceWarehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!access.canAccessWarehouse(destinationWarehouseId)) {
      return NextResponse.json(
        { error: "Destination warehouse is outside your allowed scope." },
        { status: 403 },
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one transfer item is required." },
        { status: 400 },
      );
    }

    const uniqueVariantIds = new Set<number>();
    const normalizedItems = items.map((item, index) => {
      const productVariantId = Number(item.productVariantId);
      const quantityRequested = Number(item.quantityRequested);
      if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
        throw new Error(`Item ${index + 1}: variant is required`);
      }
      if (uniqueVariantIds.has(productVariantId)) {
        throw new Error(`Item ${index + 1}: duplicate variant selected`);
      }
      uniqueVariantIds.add(productVariantId);
      if (!Number.isInteger(quantityRequested) || quantityRequested <= 0) {
        throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
      }
      return {
        productVariantId,
        quantityRequested,
        description: cleanText(item.description, 255),
      };
    });

    const [sourceWarehouse, destinationWarehouse, variants] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { id: sourceWarehouseId },
        select: { id: true, name: true, code: true },
      }),
      prisma.warehouse.findUnique({
        where: { id: destinationWarehouseId },
        select: { id: true, name: true, code: true },
      }),
      prisma.productVariant.findMany({
        where: { id: { in: normalizedItems.map((item) => item.productVariantId) } },
        select: {
          id: true,
          sku: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    if (!sourceWarehouse) {
      return NextResponse.json(
        { error: "Source warehouse not found." },
        { status: 404 },
      );
    }
    if (!destinationWarehouse) {
      return NextResponse.json(
        { error: "Destination warehouse not found." },
        { status: 404 },
      );
    }
    if (variants.length !== normalizedItems.length) {
      return NextResponse.json(
        { error: "One or more variants were not found." },
        { status: 400 },
      );
    }

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const requiredBy = body.requiredBy ? new Date(String(body.requiredBy)) : null;
    if (requiredBy && Number.isNaN(requiredBy.getTime())) {
      return NextResponse.json(
        { error: "Required date is invalid." },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const transferNumber = await generateWarehouseTransferNumber(tx);
      return tx.warehouseTransfer.create({
        data: {
          transferNumber,
          sourceWarehouseId,
          destinationWarehouseId,
          requiredBy,
          note: cleanText(body.note, 500) || null,
          createdById: access.userId,
          items: {
            create: normalizedItems.map((item) => ({
              productVariantId: item.productVariantId,
              quantityRequested: item.quantityRequested,
              description:
                item.description ||
                `${variantMap.get(item.productVariantId)?.product.name ?? "Variant"} (${variantMap.get(item.productVariantId)?.sku ?? "SKU"})`,
            })),
          },
        },
        include: warehouseTransferInclude,
      });
    });

    await logActivity({
      action: "create",
      entity: "warehouse_transfer",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created warehouse transfer ${created.transferNumber}`,
      },
      after: toWarehouseTransferLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM WAREHOUSE TRANSFERS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create warehouse transfer." },
      { status: 500 },
    );
  }
}
