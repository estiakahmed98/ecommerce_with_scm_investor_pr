import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSupplierPortalContext } from "@/lib/supplier-portal";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("supplier.purchase_orders.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        supplierId: resolved.context.supplierId,
        ...(status
          ? {
              status: status as Prisma.EnumPurchaseOrderStatusFilter["equals"],
            }
          : {}),
        ...(search
          ? {
              OR: [
                { poNumber: { contains: search, mode: "insensitive" } },
                { warehouse: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ orderDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        poNumber: true,
        status: true,
        approvalStage: true,
        orderDate: true,
        expectedAt: true,
        submittedAt: true,
        approvedAt: true,
        receivedAt: true,
        currency: true,
        subtotal: true,
        taxTotal: true,
        shippingTotal: true,
        grandTotal: true,
        notes: true,
        termsAndConditions: true,
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            productVariantId: true,
            description: true,
            quantityOrdered: true,
            quantityReceived: true,
            unitCost: true,
            lineTotal: true,
            productVariant: {
              select: {
                id: true,
                sku: true,
                product: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        goodsReceipts: {
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            receiptNumber: true,
            status: true,
            receivedAt: true,
          },
        },
      },
      take: 200,
    });

    return NextResponse.json(
      purchaseOrders.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        approvalStage: po.approvalStage,
        orderDate: po.orderDate.toISOString(),
        expectedAt: po.expectedAt?.toISOString() ?? null,
        submittedAt: po.submittedAt?.toISOString() ?? null,
        approvedAt: po.approvedAt?.toISOString() ?? null,
        receivedAt: po.receivedAt?.toISOString() ?? null,
        currency: po.currency,
        subtotal: po.subtotal.toString(),
        taxTotal: po.taxTotal.toString(),
        shippingTotal: po.shippingTotal.toString(),
        grandTotal: po.grandTotal.toString(),
        notes: po.notes,
        termsAndConditions: po.termsAndConditions,
        warehouse: po.warehouse,
        items: po.items.map((item) => ({
          id: item.id,
          productVariantId: item.productVariantId,
          sku: item.productVariant.sku,
          productName: item.productVariant.product.name,
          description: item.description,
          quantityOrdered: item.quantityOrdered,
          quantityReceived: item.quantityReceived,
          unitCost: item.unitCost.toString(),
          lineTotal: item.lineTotal.toString(),
        })),
        goodsReceipts: po.goodsReceipts.map((receipt) => ({
          id: receipt.id,
          receiptNumber: receipt.receiptNumber,
          status: receipt.status,
          receivedAt: receipt.receivedAt.toISOString(),
        })),
      })),
    );
  } catch (error) {
    console.error("SUPPLIER PORTAL PURCHASE ORDERS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier purchase orders." },
      { status: 500 },
    );
  }
}
