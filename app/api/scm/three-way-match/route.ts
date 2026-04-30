import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import {
  refreshSupplierInvoiceThreeWayMatch,
  supplierInvoiceInclude,
} from "@/lib/scm";
import { evaluateSupplierInvoiceApControls } from "@/lib/supplier-sla";

function canReadThreeWayMatch(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return (
    access.hasGlobal("three_way_match.read") ||
    access.hasGlobal("supplier_invoices.read") ||
    access.hasGlobal("supplier_invoices.manage")
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
    if (!canReadThreeWayMatch(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const status = request.nextUrl.searchParams.get("status")?.trim() || "";

    const invoices = await prisma.supplierInvoice.findMany({
      where: {
        purchaseOrderId: { not: null },
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
        ...(status ? { matchStatus: status as any } : {}),
      },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      include: supplierInvoiceInclude,
    });

    const evaluations = await Promise.all(
      invoices.map(async (invoice) => {
        const refreshed = await prisma.$transaction((tx) =>
          refreshSupplierInvoiceThreeWayMatch(tx, invoice.id, access.userId).then(
            async (result) => {
              await evaluateSupplierInvoiceApControls(tx, result.invoice.id, access.userId);
              const latestInvoice = await tx.supplierInvoice.findUniqueOrThrow({
                where: { id: result.invoice.id },
                include: supplierInvoiceInclude,
              });
              return {
                invoice: latestInvoice,
                evaluation: result.evaluation,
              };
            },
          ),
        );
        return {
          invoice: refreshed.invoice,
          match: refreshed.evaluation,
        };
      }),
    );

    return NextResponse.json(evaluations);
  } catch (error) {
    console.error("THREE WAY MATCH GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load three-way match workspace." },
      { status: 500 },
    );
  }
}
