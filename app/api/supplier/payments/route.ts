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
    if (!resolved.context.access.has("supplier.payments.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const [paymentRows, invoiceRows] = await Promise.all([
      prisma.supplierPayment.findMany({
        where: {
          supplierId: resolved.context.supplierId,
          ...(search
            ? {
                OR: [
                  { paymentNumber: { contains: search, mode: "insensitive" } },
                  { reference: { contains: search, mode: "insensitive" } },
                  {
                    supplierInvoice: {
                      invoiceNumber: { contains: search, mode: "insensitive" },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
        select: {
          id: true,
          paymentNumber: true,
          paymentDate: true,
          amount: true,
          method: true,
          reference: true,
          note: true,
          supplierInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              currency: true,
              status: true,
            },
          },
        },
        take: 400,
      }),
      prisma.supplierInvoice.findMany({
        where: { supplierId: resolved.context.supplierId },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          payments: {
            select: {
              amount: true,
            },
          },
          ledgerEntries: {
            where: { direction: "CREDIT", entryType: "ADJUSTMENT" },
            select: { amount: true },
          },
        },
      }),
    ]);

    const totals = paymentRows.reduce(
      (sum, row) => sum.plus(row.amount),
      new Prisma.Decimal(0),
    );

    const outstandingTotal = invoiceRows.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce(
        (invoiceSum, payment) => invoiceSum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      const adjustments = invoice.ledgerEntries.reduce(
        (entrySum, entry) => entrySum.plus(entry.amount),
        new Prisma.Decimal(0),
      );
      const outstanding = invoice.total.minus(paid.plus(adjustments));
      return outstanding.gt(0) ? sum.plus(outstanding) : sum;
    }, new Prisma.Decimal(0));

    return NextResponse.json({
      summary: {
        paymentCount: paymentRows.length,
        settledAmount: totals.toString(),
        outstandingAmount: outstandingTotal.toString(),
      },
      rows: paymentRows.map((row) => ({
        id: row.id,
        paymentNumber: row.paymentNumber,
        paymentDate: row.paymentDate.toISOString(),
        amount: row.amount.toString(),
        method: row.method,
        reference: row.reference,
        note: row.note,
        invoice: row.supplierInvoice
          ? {
              id: row.supplierInvoice.id,
              invoiceNumber: row.supplierInvoice.invoiceNumber,
              total: row.supplierInvoice.total.toString(),
              currency: row.supplierInvoice.currency,
              status: row.supplierInvoice.status,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("SUPPLIER PAYMENTS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier payments." }, { status: 500 });
  }
}
