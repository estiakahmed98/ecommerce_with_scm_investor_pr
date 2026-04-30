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
    if (!resolved.context.access.has("supplier.work_orders.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const awards = await prisma.rfqAward.findMany({
      where: {
        supplierId: resolved.context.supplierId,
        ...(status
          ? {
              purchaseOrder: {
                status: status as Prisma.EnumPurchaseOrderStatusFilter["equals"],
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { rfq: { rfqNumber: { contains: search, mode: "insensitive" } } },
                { purchaseOrder: { poNumber: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ awardedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        awardedAt: true,
        note: true,
        rfq: {
          select: {
            id: true,
            rfqNumber: true,
            requestedAt: true,
            submissionDeadline: true,
            warehouse: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            status: true,
            approvalStage: true,
            orderDate: true,
            expectedAt: true,
            receivedAt: true,
            currency: true,
            grandTotal: true,
            notes: true,
            termsAndConditions: true,
            items: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                quantityOrdered: true,
                quantityReceived: true,
                unitCost: true,
                lineTotal: true,
                productVariant: {
                  select: {
                    sku: true,
                    product: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      take: 250,
    });

    return NextResponse.json(
      awards.map((award) => ({
        id: award.id,
        status: award.status,
        awardedAt: award.awardedAt.toISOString(),
        note: award.note,
        rfq: {
          id: award.rfq.id,
          rfqNumber: award.rfq.rfqNumber,
          requestedAt: award.rfq.requestedAt.toISOString(),
          submissionDeadline: award.rfq.submissionDeadline?.toISOString() ?? null,
          warehouse: award.rfq.warehouse,
        },
        purchaseOrder: award.purchaseOrder
          ? {
              id: award.purchaseOrder.id,
              poNumber: award.purchaseOrder.poNumber,
              status: award.purchaseOrder.status,
              approvalStage: award.purchaseOrder.approvalStage,
              orderDate: award.purchaseOrder.orderDate.toISOString(),
              expectedAt: award.purchaseOrder.expectedAt?.toISOString() ?? null,
              receivedAt: award.purchaseOrder.receivedAt?.toISOString() ?? null,
              currency: award.purchaseOrder.currency,
              grandTotal: award.purchaseOrder.grandTotal.toString(),
              notes: award.purchaseOrder.notes,
              termsAndConditions: award.purchaseOrder.termsAndConditions,
              items: award.purchaseOrder.items.map((item) => ({
                id: item.id,
                productName: item.productVariant.product.name,
                sku: item.productVariant.sku,
                quantityOrdered: item.quantityOrdered,
                quantityReceived: item.quantityReceived,
                unitCost: item.unitCost.toString(),
                lineTotal: item.lineTotal.toString(),
              })),
            }
          : null,
      })),
    );
  } catch (error) {
    console.error("SUPPLIER WORK ORDERS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier work orders." }, { status: 500 });
  }
}
