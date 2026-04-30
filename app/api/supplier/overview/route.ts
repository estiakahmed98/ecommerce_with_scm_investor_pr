import { Prisma } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSupplierPortalContext } from "@/lib/supplier-portal";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { supplierId } = resolved.context;
    const now = new Date();
    const next30Days = new Date(now);
    next30Days.setDate(now.getDate() + 30);

    const [invites, purchaseOrderRows, invoiceRows, paymentRows, pendingRequests, expiringDocs, unreadNotifications] = await Promise.all([
      prisma.rfqSupplierInvite.findMany({
        where: {
          supplierId,
          rfq: { status: { in: ["SUBMITTED", "CLOSED", "AWARDED"] } },
        },
        select: {
          id: true,
          status: true,
          invitedAt: true,
          respondedAt: true,
          rfq: {
            select: {
              id: true,
              rfqNumber: true,
              status: true,
              requestedAt: true,
              submissionDeadline: true,
            },
          },
          quotation: {
            select: {
              id: true,
              quotedAt: true,
            },
          },
        },
        orderBy: [{ invitedAt: "desc" }, { id: "desc" }],
        take: 25,
      }),
      prisma.purchaseOrder.findMany({
        where: { supplierId },
        select: {
          id: true,
          poNumber: true,
          status: true,
          orderDate: true,
          expectedAt: true,
          grandTotal: true,
        },
        orderBy: [{ orderDate: "desc" }, { id: "desc" }],
        take: 50,
      }),
      prisma.supplierInvoice.findMany({
        where: { supplierId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          dueDate: true,
          total: true,
          payments: { select: { amount: true } },
          ledgerEntries: {
            where: { entryType: "ADJUSTMENT", direction: "CREDIT" },
            select: { amount: true },
          },
        },
        orderBy: [{ issueDate: "desc" }, { id: "desc" }],
        take: 100,
      }),
      prisma.supplierPayment.findMany({
        where: { supplierId },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
        },
        orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
        take: 20,
      }),
      prisma.supplierProfileUpdateRequest.count({
        where: {
          supplierId,
          requestedByUserId: resolved.context.userId,
          status: "PENDING",
        },
      }),
      prisma.supplierDocument.count({
        where: {
          supplierId,
          expiresAt: {
            lte: next30Days,
          },
        },
      }),
      prisma.supplierPortalNotification.count({
        where: {
          supplierId,
          OR: [{ userId: null }, { userId: resolved.context.userId }],
          readAt: null,
        },
      }),
    ]);

    const actionableRfqCount = invites.filter(
      (invite) =>
        invite.rfq.status === "SUBMITTED" &&
        (!invite.quotation || invite.status !== "RESPONDED"),
    ).length;
    const respondedRfqCount = invites.filter((invite) => Boolean(invite.quotation)).length;

    const activePurchaseOrderCount = purchaseOrderRows.filter((row) =>
      [
        "SUBMITTED",
        "MANAGER_APPROVED",
        "COMMITTEE_APPROVED",
        "APPROVED",
        "PARTIALLY_RECEIVED",
      ].includes(row.status),
    ).length;
    const dueSoonPurchaseOrderCount = purchaseOrderRows.filter(
      (row) => row.expectedAt && row.expectedAt >= now && row.expectedAt <= next30Days,
    ).length;

    const outstandingTotal = invoiceRows.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce(
        (paymentSum, payment) => paymentSum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      const adjustments = invoice.ledgerEntries.reduce(
        (entrySum, entry) => entrySum.plus(entry.amount),
        new Prisma.Decimal(0),
      );
      const settled = paid.plus(adjustments);
      const outstanding = invoice.total.minus(settled);
      return outstanding.gt(0) ? sum.plus(outstanding) : sum;
    }, new Prisma.Decimal(0));

    const overdueInvoiceCount = invoiceRows.filter((invoice) => {
      if (!invoice.dueDate) return false;
      const paid = invoice.payments.reduce(
        (paymentSum, payment) => paymentSum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      const adjustments = invoice.ledgerEntries.reduce(
        (entrySum, entry) => entrySum.plus(entry.amount),
        new Prisma.Decimal(0),
      );
      return invoice.total.minus(paid.plus(adjustments)).gt(0) && invoice.dueDate < now;
    }).length;

    const recentPaymentTotal = paymentRows.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );

    return NextResponse.json({
      supplier: {
        id: resolved.context.supplierId,
        code: resolved.context.supplierCode,
        name: resolved.context.supplierName,
      },
      summary: {
        actionableRfqCount,
        respondedRfqCount,
        activePurchaseOrderCount,
        dueSoonPurchaseOrderCount,
        overdueInvoiceCount,
        outstandingAmount: outstandingTotal.toString(),
        recentPaymentAmount: recentPaymentTotal.toString(),
        pendingProfileRequestCount: pendingRequests,
        expiringDocumentCount: expiringDocs,
        unreadNotificationCount: unreadNotifications,
      },
      recentRfqs: invites.slice(0, 10).map((invite) => ({
        inviteId: invite.id,
        status: invite.status,
        invitedAt: invite.invitedAt.toISOString(),
        respondedAt: invite.respondedAt?.toISOString() ?? null,
        quotationId: invite.quotation?.id ?? null,
        rfq: {
          id: invite.rfq.id,
          rfqNumber: invite.rfq.rfqNumber,
          status: invite.rfq.status,
          requestedAt: invite.rfq.requestedAt.toISOString(),
          submissionDeadline: invite.rfq.submissionDeadline?.toISOString() ?? null,
        },
      })),
      recentPurchaseOrders: purchaseOrderRows.slice(0, 10).map((row) => ({
        id: row.id,
        poNumber: row.poNumber,
        status: row.status,
        orderDate: row.orderDate.toISOString(),
        expectedAt: row.expectedAt?.toISOString() ?? null,
        grandTotal: row.grandTotal.toString(),
      })),
      recentInvoices: invoiceRows.slice(0, 10).map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        dueDate: invoice.dueDate?.toISOString() ?? null,
        total: invoice.total.toString(),
      })),
    });
  } catch (error) {
    console.error("SUPPLIER PORTAL OVERVIEW GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier dashboard overview." },
      { status: 500 },
    );
  }
}
