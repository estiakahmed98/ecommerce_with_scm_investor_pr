import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  buildReplenishmentSuggestion,
  replenishmentRuleInclude,
} from "@/lib/replenishment";
import {
  generatePurchaseRequisitionNumber,
  generateWarehouseTransferNumber,
  purchaseRequisitionInclude,
  toPurchaseRequisitionLogSnapshot,
  toWarehouseTransferLogSnapshot,
  warehouseTransferInclude,
} from "@/lib/scm";
import { resolveWarehouseScope } from "@/lib/warehouse-scope";

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
    const includeHealthy = request.nextUrl.searchParams.get("includeHealthy") === "1";
    const scope = resolveWarehouseScope(
      access,
      "replenishment.read",
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
    );

    if (scope.mode === "none") {
      return NextResponse.json([]);
    }

    const rules = await prisma.replenishmentRule.findMany({
      where:
        scope.mode === "all"
          ? { isActive: true }
          : {
              isActive: true,
              warehouseId: { in: scope.warehouseIds },
            },
      orderBy: [{ warehouseId: "asc" }, { productVariantId: "asc" }],
      include: replenishmentRuleInclude,
    });

    const suggestions = rules
      .map((rule) => ({
        rule,
        suggestion: buildReplenishmentSuggestion(rule),
      }))
      .filter(({ suggestion }) => includeHealthy || suggestion.triggered)
      .map(({ rule, suggestion }) => ({
        ...suggestion,
        rule: {
          id: rule.id,
          isActive: rule.isActive,
          note: rule.note,
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt,
        },
      }));

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("SCM REPLENISHMENT SUGGESTIONS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load replenishment suggestions." },
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
      action?: unknown;
      warehouseId?: unknown;
      neededBy?: unknown;
      note?: unknown;
      items?: Array<{
        ruleId?: unknown;
        quantityRequested?: unknown;
      }>;
    };
    const action =
      typeof body.action === "string" ? body.action.trim().toLowerCase() : "create_requisition";

    const warehouseId = Number(body.warehouseId);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
    }
    if (!access.can("replenishment.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requestItems = Array.isArray(body.items) ? body.items : [];
    if (requestItems.length === 0) {
      return NextResponse.json(
        { error: "At least one replenishment suggestion item is required." },
        { status: 400 },
      );
    }

    const normalizedItems = requestItems.map((item, index) => {
      const ruleId = Number(item.ruleId);
      const quantityRequested = Number(item.quantityRequested);
      if (!Number.isInteger(ruleId) || ruleId <= 0) {
        throw new Error(`Item ${index + 1}: rule id is required`);
      }
      if (!Number.isInteger(quantityRequested) || quantityRequested <= 0) {
        throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
      }
      return { ruleId, quantityRequested };
    });

    const rules = await prisma.replenishmentRule.findMany({
      where: {
        id: { in: normalizedItems.map((item) => item.ruleId) },
        warehouseId,
        isActive: true,
      },
      include: replenishmentRuleInclude,
    });

    if (rules.length !== normalizedItems.length) {
      return NextResponse.json(
        { error: "One or more replenishment rules were not found for this warehouse." },
        { status: 400 },
      );
    }

    const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));
    const computedItems = normalizedItems.map((item) => {
      const rule = ruleMap.get(item.ruleId);
      if (!rule) {
        throw new Error("Replenishment rule lookup failed");
      }
      const suggestion = buildReplenishmentSuggestion(rule);
      return {
        rule,
        suggestion,
        productVariantId: rule.productVariantId,
        quantityRequested: item.quantityRequested,
        description: `${rule.productVariant.product.name} (${rule.productVariant.sku})`,
      };
    });

    const neededBy = body.neededBy ? new Date(String(body.neededBy)) : null;
    if (neededBy && Number.isNaN(neededBy.getTime())) {
      return NextResponse.json(
        { error: "Needed-by date is invalid." },
        { status: 400 },
      );
    }

    if (action === "create_transfer") {
      const transferItems = computedItems.map((item) => {
        const allowedMax = Math.max(0, item.suggestion.transferQty);
        if (allowedMax <= 0 || !item.suggestion.sourceWarehouse) {
          throw new Error(
            `${item.rule.productVariant.product.name} (${item.rule.productVariant.sku}) does not have a transfer recommendation right now.`,
          );
        }
        if (item.quantityRequested > allowedMax) {
          throw new Error(
            `${item.rule.productVariant.product.name} (${item.rule.productVariant.sku}) exceeds suggested transfer quantity.`,
          );
        }
        return item;
      });

      const sourceWarehouseIds = [
        ...new Set(
          transferItems.map((item) => item.suggestion.sourceWarehouse?.id).filter(Boolean),
        ),
      ];
      if (sourceWarehouseIds.length !== 1) {
        return NextResponse.json(
          {
            error:
              "Selected transfer suggestions must share the same source warehouse.",
          },
          { status: 400 },
        );
      }

      const sourceWarehouseId = Number(sourceWarehouseIds[0]);
      if (!access.can("warehouse_transfers.manage", sourceWarehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json(
          { error: "Destination warehouse is outside your allowed scope." },
          { status: 403 },
        );
      }

      const createdTransfer = await prisma.$transaction(async (tx) => {
        const transferNumber = await generateWarehouseTransferNumber(tx);
        return tx.warehouseTransfer.create({
          data: {
            transferNumber,
            sourceWarehouseId,
            destinationWarehouseId: warehouseId,
            requiredBy: neededBy,
            note:
              toCleanText(body.note, 500) ||
              "Generated from replenishment planning suggestion.",
            createdById: access.userId,
            items: {
              create: transferItems.map((item) => ({
                productVariantId: item.productVariantId,
                quantityRequested: item.quantityRequested,
                description: `${item.description} [Replenishment suggestion]`,
              })),
            },
          },
          include: warehouseTransferInclude,
        });
      });

      await logActivity({
        action: "create",
        entity: "warehouse_transfer",
        entityId: createdTransfer.id,
        access,
        request,
        metadata: {
          message: `Created warehouse transfer ${createdTransfer.transferNumber} from replenishment planning`,
          source: "replenishment_planning",
        },
        after: toWarehouseTransferLogSnapshot(createdTransfer),
      });

      return NextResponse.json(createdTransfer, { status: 201 });
    }

    if (!access.can("purchase_requisitions.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requisitionItems = computedItems.map((item) => {
      const allowedMax = Math.max(0, item.suggestion.purchaseQty);
      if (allowedMax <= 0) {
        throw new Error(
          `${item.rule.productVariant.product.name} (${item.rule.productVariant.sku}) does not need purchase replenishment right now.`,
        );
      }
      if (item.quantityRequested > allowedMax) {
        throw new Error(
          `${item.rule.productVariant.product.name} (${item.rule.productVariant.sku}) exceeds suggested purchase quantity.`,
        );
      }
      return {
        productVariantId: item.productVariantId,
        quantityRequested: item.quantityRequested,
        description: item.description,
      };
    });

    const created = await prisma.$transaction(async (tx) => {
      const requisitionNumber = await generatePurchaseRequisitionNumber(tx);
      return tx.purchaseRequisition.create({
        data: {
          requisitionNumber,
          warehouseId,
          neededBy,
          note: toCleanText(body.note, 500) || "Generated from replenishment planning.",
          createdById: access.userId,
          items: {
            create: requisitionItems,
          },
        },
        include: purchaseRequisitionInclude,
      });
    });

    await logActivity({
      action: "create",
      entity: "purchase_requisition",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created purchase requisition ${created.requisitionNumber} from replenishment planning`,
        source: "replenishment_planning",
      },
      after: toPurchaseRequisitionLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM REPLENISHMENT SUGGESTIONS POST ERROR:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to create replenishment requisition or transfer draft.",
      },
      { status: 500 },
    );
  }
}
