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
    if (!resolved.context.access.has("supplier.invoices.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const invoices = await prisma.supplierInvoice.findMany({
      where: {
        supplierId: resolved.context.supplierId,
        ...(status
          ? {
              status: status as Prisma.EnumSupplierInvoiceStatusFilter["equals"],
            }
          : {}),
        ...(search
          ? {
              OR: [
                { invoiceNumber: { contains: search, mode: "insensitive" } },
                { purchaseOrder: { poNumber: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        matchStatus: true,
        issueDate: true,
        dueDate: true,
        postedAt: true,
        currency: true,
        subtotal: true,
        taxTotal: true,
        otherCharges: true,
        total: true,
        paymentHoldStatus: true,
        paymentHoldReason: true,
        slaCreditStatus: true,
        slaRecommendedCredit: true,
        note: true,
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            status: true,
          },
        },
        payments: {
          orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
          select: {
            id: true,
            paymentNumber: true,
            paymentDate: true,
            amount: true,
            method: true,
            reference: true,
          },
        },
        ledgerEntries: {
          where: {
            direction: "CREDIT",
            entryType: "ADJUSTMENT",
          },
          select: {
            id: true,
            amount: true,
            entryType: true,
            referenceType: true,
            referenceNumber: true,
            entryDate: true,
          },
        },
      },
      take: 300,
    });

    const rows = invoices.map((invoice) => {
      const paidAmount = invoice.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      const adjustmentCredits = invoice.ledgerEntries.reduce(
        (sum, entry) => sum.plus(entry.amount),
        new Prisma.Decimal(0),
      );
      const settledAmount = paidAmount.plus(adjustmentCredits);
      const outstanding = invoice.total.minus(settledAmount);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        matchStatus: invoice.matchStatus,
        issueDate: invoice.issueDate.toISOString(),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        postedAt: invoice.postedAt.toISOString(),
        currency: invoice.currency,
        subtotal: invoice.subtotal.toString(),
        taxTotal: invoice.taxTotal.toString(),
        otherCharges: invoice.otherCharges.toString(),
        total: invoice.total.toString(),
        paymentHoldStatus: invoice.paymentHoldStatus,
        paymentHoldReason: invoice.paymentHoldReason,
        slaCreditStatus: invoice.slaCreditStatus,
        slaRecommendedCredit: invoice.slaRecommendedCredit.toString(),
        note: invoice.note,
        settledAmount: settledAmount.toString(),
        outstandingAmount: outstanding.gt(0)
          ? outstanding.toString()
          : new Prisma.Decimal(0).toString(),
        purchaseOrder: invoice.purchaseOrder,
        payments: invoice.payments.map((payment) => ({
          id: payment.id,
          paymentNumber: payment.paymentNumber,
          paymentDate: payment.paymentDate.toISOString(),
          amount: payment.amount.toString(),
          method: payment.method,
          reference: payment.reference,
        })),
      };
    });

    const totals = rows.reduce(
      (sum, row) => {
        sum.invoiceTotal = sum.invoiceTotal.plus(new Prisma.Decimal(row.total));
        sum.settledTotal = sum.settledTotal.plus(new Prisma.Decimal(row.settledAmount));
        sum.outstandingTotal = sum.outstandingTotal.plus(
          new Prisma.Decimal(row.outstandingAmount),
        );
        return sum;
      },
      {
        invoiceTotal: new Prisma.Decimal(0),
        settledTotal: new Prisma.Decimal(0),
        outstandingTotal: new Prisma.Decimal(0),
      },
    );

    return NextResponse.json({
      summary: {
        count: rows.length,
        invoiceTotal: totals.invoiceTotal.toString(),
        settledTotal: totals.settledTotal.toString(),
        outstandingTotal: totals.outstandingTotal.toString(),
      },
      rows,
    });
  } catch (error) {
    console.error("SUPPLIER PORTAL INVOICES GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier invoices." },
      { status: 500 },
    );
  }
}
