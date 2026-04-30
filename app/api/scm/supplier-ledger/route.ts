import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import {
  computeSupplierLedgerTotals,
  evaluateSupplierInvoiceThreeWayMatch,
  supplierInvoiceInclude,
} from "@/lib/scm";

function canReadSupplierLedger(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("supplier_ledger.read") ||
    access.hasGlobal("supplier_invoices.read") ||
    access.hasGlobal("supplier_payments.read")
  );
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
    if (!canReadSupplierLedger(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");

    if (Number.isInteger(supplierId) && supplierId > 0) {
      const [supplier, entries, invoices, payments] = await Promise.all([
        prisma.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, name: true, code: true, currency: true, isActive: true },
        }),
        prisma.supplierLedgerEntry.findMany({
          where: { supplierId },
          orderBy: [{ entryDate: "asc" }, { id: "asc" }],
          include: {
            supplierInvoice: {
              select: { id: true, invoiceNumber: true, status: true },
            },
            supplierPayment: {
              select: { id: true, paymentNumber: true, method: true },
            },
            purchaseOrder: {
              select: { id: true, poNumber: true },
            },
          },
        }),
        prisma.supplierInvoice.findMany({
          where: { supplierId },
          orderBy: [{ issueDate: "desc" }, { id: "desc" }],
          include: supplierInvoiceInclude,
        }),
        prisma.supplierPayment.findMany({
          where: { supplierId },
          orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
          include: {
            supplierInvoice: {
              select: { id: true, invoiceNumber: true, status: true },
            },
          },
        }),
      ]);

      if (!supplier) {
        return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
      }

      const totals = computeSupplierLedgerTotals(entries);
      const invoicesWithMatch = invoices.map((invoice) => ({
        ...invoice,
        threeWayMatch: evaluateSupplierInvoiceThreeWayMatch(
          invoice as Parameters<typeof evaluateSupplierInvoiceThreeWayMatch>[0],
        ),
      }));
      return NextResponse.json({
        supplier,
        summary: {
          totalDebit: totals.debit.toString(),
          totalCredit: totals.credit.toString(),
          balance: totals.balance.toString(),
        },
        entries,
        invoices: invoicesWithMatch,
        payments,
      });
    }

    const suppliers = await prisma.supplier.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        ledgerEntries: {
          select: {
            direction: true,
            amount: true,
          },
        },
      },
    });

    const summary = suppliers.map((supplier) => {
      const totals = computeSupplierLedgerTotals(
        supplier.ledgerEntries as Array<{
          direction: "DEBIT" | "CREDIT";
          amount: Prisma.Decimal;
        }>,
      );
      return {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        isActive: supplier.isActive,
        currency: supplier.currency,
        totalDebit: totals.debit.toString(),
        totalCredit: totals.credit.toString(),
        balance: totals.balance.toString(),
      };
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("SUPPLIER LEDGER GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier ledger." }, { status: 500 });
  }
}
