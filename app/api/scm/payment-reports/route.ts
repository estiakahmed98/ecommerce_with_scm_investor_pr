import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
    if (!access.hasAny(["payment_reports.read", "supplier_payments.read", "supplier_payments.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const from = parseDate(request.nextUrl.searchParams.get("from"));
    const to = parseDate(request.nextUrl.searchParams.get("to"));
    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");

    const where: any = {};
    if (from || to) {
      where.paymentDate = {};
      if (from) where.paymentDate.gte = from;
      if (to) where.paymentDate.lte = to;
    }
    if (Number.isInteger(supplierId) && supplierId > 0) {
      where.supplierId = supplierId;
    }

    const rows = await prisma.supplierPayment.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      take: 1000,
    });

    const supplierTotals = new Map<
      number,
      {
        supplier: { id: number; name: string; code: string };
        totalPaid: number;
        paymentCount: number;
      }
    >();

    for (const row of rows) {
      const key = row.supplierId;
      const existing = supplierTotals.get(key) ?? {
        supplier: row.supplier,
        totalPaid: 0,
        paymentCount: 0,
      };
      existing.totalPaid += Number(row.amount || 0);
      existing.paymentCount += 1;
      supplierTotals.set(key, existing);
    }

    return NextResponse.json({
      range: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      summary: Array.from(supplierTotals.values()).sort((a, b) => b.totalPaid - a.totalPaid),
      rows,
    });
  } catch (error) {
    console.error("PAYMENT REPORT GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load payment report." }, { status: 500 });
  }
}
