import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { replenishmentRuleInclude } from "@/lib/replenishment";
import { resolveWarehouseScope } from "@/lib/warehouse-scope";

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeNonNegativeInt(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return number;
}

function toRuleLogSnapshot(rule: Awaited<ReturnType<typeof prisma.replenishmentRule.findUniqueOrThrow>>) {
  return {
    warehouseId: rule.warehouseId,
    productVariantId: rule.productVariantId,
    strategy: rule.strategy,
    reorderPoint: rule.reorderPoint,
    targetStockLevel: rule.targetStockLevel,
    safetyStock: rule.safetyStock,
    minOrderQty: rule.minOrderQty,
    orderMultiple: rule.orderMultiple,
    leadTimeDays: rule.leadTimeDays,
    isActive: rule.isActive,
    note: rule.note,
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
    if (!access.hasAny(["replenishment.read", "replenishment.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const scope = resolveWarehouseScope(
      access,
      "replenishment.read",
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
    );

    if (scope.mode === "none") {
      return NextResponse.json([]);
    }

    const where =
      scope.mode === "all"
        ? {
            ...(includeInactive ? {} : { isActive: true }),
          }
        : {
            warehouseId: { in: scope.warehouseIds },
            ...(includeInactive ? {} : { isActive: true }),
          };

    const rules = await prisma.replenishmentRule.findMany({
      where,
      orderBy: [
        { warehouseId: "asc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      include: replenishmentRuleInclude,
    });

    return NextResponse.json(rules);
  } catch (error) {
    console.error("SCM REPLENISHMENT RULES GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load replenishment rules." },
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
      ruleId?: unknown;
      warehouseId?: unknown;
      productVariantId?: unknown;
      strategy?: unknown;
      reorderPoint?: unknown;
      targetStockLevel?: unknown;
      safetyStock?: unknown;
      minOrderQty?: unknown;
      orderMultiple?: unknown;
      leadTimeDays?: unknown;
      isActive?: unknown;
      note?: unknown;
    };

    const warehouseId = normalizeNonNegativeInt(body.warehouseId, "Warehouse");
    const productVariantId = normalizeNonNegativeInt(body.productVariantId, "Variant");
    if (warehouseId <= 0 || productVariantId <= 0) {
      return NextResponse.json(
        { error: "Warehouse and variant are required." },
        { status: 400 },
      );
    }
    if (!access.can("replenishment.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const strategy =
      String(body.strategy || "MIN_MAX").trim().toUpperCase() === "REORDER_POINT"
        ? "REORDER_POINT"
        : "MIN_MAX";
    const reorderPoint = normalizeNonNegativeInt(body.reorderPoint, "Reorder point");
    const targetStockLevel = normalizeNonNegativeInt(
      body.targetStockLevel,
      "Target stock level",
    );
    const safetyStock = normalizeNonNegativeInt(body.safetyStock ?? 0, "Safety stock");
    const minOrderQty = Math.max(
      1,
      normalizeNonNegativeInt(body.minOrderQty ?? 1, "Minimum order quantity"),
    );
    const orderMultiple = Math.max(
      1,
      normalizeNonNegativeInt(body.orderMultiple ?? 1, "Order multiple"),
    );
    const leadTimeDays =
      body.leadTimeDays === null ||
      body.leadTimeDays === undefined ||
      body.leadTimeDays === ""
        ? null
        : normalizeNonNegativeInt(body.leadTimeDays, "Lead time");
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

    if (targetStockLevel < reorderPoint) {
      return NextResponse.json(
        { error: "Target stock level must be greater than or equal to reorder point." },
        { status: 400 },
      );
    }

    const [warehouse, variant] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, name: true, code: true },
      }),
      prisma.productVariant.findUnique({
        where: { id: productVariantId },
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

    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
    }
    if (!variant) {
      return NextResponse.json({ error: "Variant not found." }, { status: 404 });
    }

    const ruleId =
      body.ruleId === null || body.ruleId === undefined || body.ruleId === ""
        ? null
        : Number(body.ruleId);

    const existingRule = ruleId
      ? await prisma.replenishmentRule.findUnique({
          where: { id: ruleId },
        })
      : await prisma.replenishmentRule.findUnique({
          where: {
            warehouseId_productVariantId: {
              warehouseId,
              productVariantId,
            },
          },
        });

    if (existingRule && !access.can("replenishment.manage", existingRule.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const savedRule = await prisma.replenishmentRule.upsert({
      where: {
        warehouseId_productVariantId: {
          warehouseId,
          productVariantId,
        },
      },
      create: {
        warehouseId,
        productVariantId,
        strategy,
        reorderPoint,
        targetStockLevel,
        safetyStock,
        minOrderQty,
        orderMultiple,
        leadTimeDays,
        isActive,
        note: toCleanText(body.note, 500) || null,
        createdById: access.userId,
        updatedById: access.userId,
      },
      update: {
        strategy,
        reorderPoint,
        targetStockLevel,
        safetyStock,
        minOrderQty,
        orderMultiple,
        leadTimeDays,
        isActive,
        note: toCleanText(body.note, 500) || null,
        updatedById: access.userId,
      },
      include: replenishmentRuleInclude,
    });

    await logActivity({
      action: existingRule ? "update" : "create",
      entity: "replenishment_rule",
      entityId: savedRule.id,
      access,
      request,
      metadata: {
        message: `${existingRule ? "Updated" : "Created"} replenishment rule for ${variant.product.name} (${variant.sku}) in ${warehouse.code}`,
      },
      before: existingRule ? toRuleLogSnapshot(existingRule) : null,
      after: toRuleLogSnapshot(savedRule),
    });

    return NextResponse.json(savedRule, { status: existingRule ? 200 : 201 });
  } catch (error: any) {
    console.error("SCM REPLENISHMENT RULES POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save replenishment rule." },
      { status: 500 },
    );
  }
}
