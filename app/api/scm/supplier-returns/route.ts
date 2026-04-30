import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateSupplierReturnNumber,
  goodsReceiptInclude,
  supplierReturnInclude,
  toSupplierReturnLogSnapshot,
} from "@/lib/scm";

const SUPPLIER_RETURN_READ_PERMISSIONS = [
  "supplier_returns.read",
  "supplier_returns.manage",
  "supplier_returns.approve",
] as const;

function toCleanText(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadSupplierReturns(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasAny([...SUPPLIER_RETURN_READ_PERMISSIONS]);
}

function hasGlobalSupplierReturnScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return SUPPLIER_RETURN_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function buildWarehouseScopedWhere(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  requestedWarehouseId: number | null,
): Prisma.SupplierReturnWhereInput | null {
  if (hasGlobalSupplierReturnScope(access)) {
    return requestedWarehouseId ? { warehouseId: requestedWarehouseId } : {};
  }

  if (requestedWarehouseId) {
    if (!access.canAccessWarehouse(requestedWarehouseId)) {
      return null;
    }
    return { warehouseId: requestedWarehouseId };
  }

  if (access.warehouseIds.length === 0) {
    return null;
  }

  return { warehouseId: { in: access.warehouseIds } };
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
    if (!canReadSupplierReturns(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const warehouseFilter = buildWarehouseScopedWhere(
      access,
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
    );
    if (warehouseFilter === null) {
      return NextResponse.json([]);
    }

    const supplierReturns = await prisma.supplierReturn.findMany({
      where: {
        ...warehouseFilter,
        ...(status ? { status: status as Prisma.EnumSupplierReturnStatusFilter["equals"] } : {}),
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
        ...(search
          ? {
              OR: [
                {
                  returnNumber: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  supplier: {
                    name: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
                {
                  warehouse: {
                    name: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
                {
                  goodsReceipt: {
                    receiptNumber: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: supplierReturnInclude,
    });

    return NextResponse.json(supplierReturns);
  } catch (error) {
    console.error("SCM SUPPLIER RETURNS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier returns." },
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
      goodsReceiptId?: unknown;
      supplierInvoiceId?: unknown;
      requiredBy?: unknown;
      reasonCode?: unknown;
      note?: unknown;
      items?: Array<{
        goodsReceiptItemId?: unknown;
        quantityRequested?: unknown;
        reason?: unknown;
      }>;
    };

    const goodsReceiptId = Number(body.goodsReceiptId);
    const supplierInvoiceId =
      body.supplierInvoiceId === null ||
      body.supplierInvoiceId === undefined ||
      body.supplierInvoiceId === ""
        ? null
        : Number(body.supplierInvoiceId);

    if (!Number.isInteger(goodsReceiptId) || goodsReceiptId <= 0) {
      return NextResponse.json(
        { error: "Goods receipt is required." },
        { status: 400 },
      );
    }
    if (
      supplierInvoiceId !== null &&
      (!Number.isInteger(supplierInvoiceId) || supplierInvoiceId <= 0)
    ) {
      return NextResponse.json(
        { error: "Invalid supplier invoice." },
        { status: 400 },
      );
    }

    const goodsReceipt = await prisma.goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      include: goodsReceiptInclude,
    });
    if (!goodsReceipt) {
      return NextResponse.json(
        { error: "Goods receipt not found." },
        { status: 404 },
      );
    }
    if (!access.can("supplier_returns.manage", goodsReceipt.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierInvoice = supplierInvoiceId
      ? await prisma.supplierInvoice.findUnique({
          where: { id: supplierInvoiceId },
          select: {
            id: true,
            supplierId: true,
            purchaseOrderId: true,
          },
        })
      : null;

    if (supplierInvoiceId && !supplierInvoice) {
      return NextResponse.json(
        { error: "Supplier invoice not found." },
        { status: 404 },
      );
    }
    if (
      supplierInvoice &&
      supplierInvoice.supplierId !== goodsReceipt.purchaseOrder.supplier.id
    ) {
      return NextResponse.json(
        { error: "Selected supplier invoice does not belong to the receipt supplier." },
        { status: 400 },
      );
    }
    if (
      supplierInvoice?.purchaseOrderId &&
      supplierInvoice.purchaseOrderId !== goodsReceipt.purchaseOrderId
    ) {
      return NextResponse.json(
        { error: "Selected supplier invoice does not match the goods receipt purchase order." },
        { status: 400 },
      );
    }

    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (requestedItems.length === 0) {
      return NextResponse.json(
        { error: "At least one supplier return line is required." },
        { status: 400 },
      );
    }

    const duplicateCheck = new Set<number>();
    const normalizedItems = requestedItems.map((item, index) => {
      const goodsReceiptItemId = Number(item.goodsReceiptItemId);
      const quantityRequested = Number(item.quantityRequested);
      if (!Number.isInteger(goodsReceiptItemId) || goodsReceiptItemId <= 0) {
        throw new Error(`Item ${index + 1}: goods receipt item is required`);
      }
      if (duplicateCheck.has(goodsReceiptItemId)) {
        throw new Error(`Item ${index + 1}: duplicate goods receipt item selected`);
      }
      duplicateCheck.add(goodsReceiptItemId);
      if (!Number.isInteger(quantityRequested) || quantityRequested <= 0) {
        throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
      }
      return {
        goodsReceiptItemId,
        quantityRequested,
        reason: toCleanText(item.reason, 255),
      };
    });

    const receiptItemMap = new Map(goodsReceipt.items.map((item) => [item.id, item]));
    for (const item of normalizedItems) {
      if (!receiptItemMap.has(item.goodsReceiptItemId)) {
        return NextResponse.json(
          { error: `Goods receipt item ${item.goodsReceiptItemId} not found.` },
          { status: 400 },
        );
      }
    }

    const alreadyRequested = await prisma.supplierReturnItem.findMany({
      where: {
        goodsReceiptItemId: {
          in: normalizedItems.map((item) => item.goodsReceiptItemId),
        },
        supplierReturn: {
          status: {
            not: "CANCELLED",
          },
        },
      },
      select: {
        goodsReceiptItemId: true,
        quantityRequested: true,
      },
    });

    const requestedByReceiptItem = alreadyRequested.reduce<Map<number, number>>(
      (acc, item) => {
        if (!item.goodsReceiptItemId) return acc;
        acc.set(
          item.goodsReceiptItemId,
          (acc.get(item.goodsReceiptItemId) ?? 0) + item.quantityRequested,
        );
        return acc;
      },
      new Map(),
    );

    for (const item of normalizedItems) {
      const receiptItem = receiptItemMap.get(item.goodsReceiptItemId);
      if (!receiptItem) {
        return NextResponse.json(
          { error: `Goods receipt item ${item.goodsReceiptItemId} was not found.` },
          { status: 400 },
        );
      }
      const remaining = receiptItem.quantityReceived - (requestedByReceiptItem.get(item.goodsReceiptItemId) ?? 0);
      if (item.quantityRequested > remaining) {
        return NextResponse.json(
          {
            error: `Return quantity for ${receiptItem.productVariant.sku} exceeds available received quantity.`,
          },
          { status: 400 },
        );
      }
    }

    const requiredBy = body.requiredBy ? new Date(String(body.requiredBy)) : null;
    if (requiredBy && Number.isNaN(requiredBy.getTime())) {
      return NextResponse.json(
        { error: "Required-by date is invalid." },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const returnNumber = await generateSupplierReturnNumber(tx);
      return tx.supplierReturn.create({
        data: {
          returnNumber,
          supplierId: goodsReceipt.purchaseOrder.supplier.id,
          warehouseId: goodsReceipt.warehouseId,
          purchaseOrderId: goodsReceipt.purchaseOrderId,
          goodsReceiptId: goodsReceipt.id,
          supplierInvoiceId,
          requiredBy,
          createdById: access.userId,
          reasonCode: toCleanText(body.reasonCode, 120) || null,
          note: toCleanText(body.note, 500) || null,
          items: {
            create: normalizedItems.map((item) => {
              const receiptItem = receiptItemMap.get(item.goodsReceiptItemId);
              if (!receiptItem) {
                throw new Error("Goods receipt item lookup failed");
              }
              return {
                goodsReceiptItemId: receiptItem.id,
                purchaseOrderItemId: receiptItem.purchaseOrderItemId,
                productVariantId: receiptItem.productVariantId,
                description: `${receiptItem.productVariant.product.name} (${receiptItem.productVariant.sku})`,
                quantityRequested: item.quantityRequested,
                unitCost: receiptItem.unitCost,
                lineTotal: receiptItem.unitCost.mul(item.quantityRequested),
                reason: item.reason || null,
              };
            }),
          },
        },
        include: supplierReturnInclude,
      });
    });

    await logActivity({
      action: "create",
      entity: "supplier_return",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created supplier return ${created.returnNumber}`,
      },
      after: toSupplierReturnLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM SUPPLIER RETURNS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create supplier return." },
      { status: 500 },
    );
  }
}
