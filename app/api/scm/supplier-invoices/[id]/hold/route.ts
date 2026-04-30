import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { supplierInvoiceInclude, syncSupplierInvoicePaymentStatus } from "@/lib/scm";
import { evaluateSupplierInvoiceApControls } from "@/lib/supplier-sla";

function cleanText(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supplierInvoiceId = Number(id);
    if (!Number.isInteger(supplierInvoiceId) || supplierInvoiceId <= 0) {
      return NextResponse.json({ error: "Invalid supplier invoice id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !access.hasGlobal("supplier_invoices.manage") &&
      !access.hasGlobal("supplier_payments.override_hold")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      note?: unknown;
    };
    const action = cleanText(body.action, 40).toLowerCase();
    const note = cleanText(body.note, 1000);

    const before = await prisma.supplierInvoice.findUnique({
      where: { id: supplierInvoiceId },
      include: supplierInvoiceInclude,
    });
    if (!before) {
      return NextResponse.json({ error: "Supplier invoice not found." }, { status: 404 });
    }

    if (action === "reevaluate") {
      if (!access.hasGlobal("supplier_invoices.manage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        await evaluateSupplierInvoiceApControls(tx, supplierInvoiceId, access.userId);
        return tx.supplierInvoice.findUniqueOrThrow({
          where: { id: supplierInvoiceId },
          include: supplierInvoiceInclude,
        });
      });

      await logActivity({
        action: "ap_control_reevaluate",
        entity: "supplier_invoice",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Re-evaluated AP hold controls for invoice ${updated.invoiceNumber}`,
        },
      });

      return NextResponse.json(updated);
    }

    if (action === "override_hold") {
      if (!access.hasGlobal("supplier_payments.override_hold")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (note.length < 3) {
        return NextResponse.json(
          { error: "Override note (minimum 3 characters) is required." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const evaluated = await evaluateSupplierInvoiceApControls(
          tx,
          supplierInvoiceId,
          access.userId,
        );
        if (evaluated.paymentHoldStatus === "CLEAR") {
          throw new Error("Invoice is not currently under AP hold.");
        }

        const activePolicy = await tx.supplierSlaPolicy.findFirst({
          where: {
            supplierId: evaluated.supplierId,
            isActive: true,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          include: {
            financialRule: {
              select: {
                allowPaymentHoldOverride: true,
              },
            },
          },
        });
        if (
          activePolicy?.financialRule &&
          !activePolicy.financialRule.allowPaymentHoldOverride
        ) {
          throw new Error(
            "Payment hold override is disabled by current supplier SLA financial rule.",
          );
        }

        await tx.supplierInvoice.update({
          where: { id: supplierInvoiceId },
          data: {
            paymentHoldStatus: "OVERRIDDEN",
            paymentHoldReleasedAt: new Date(),
            paymentHoldReleasedById: access.userId,
            paymentHoldOverrideNote: note,
          },
        });
        return tx.supplierInvoice.findUniqueOrThrow({
          where: { id: supplierInvoiceId },
          include: supplierInvoiceInclude,
        });
      });

      await logActivity({
        action: "override_hold",
        entity: "supplier_invoice",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Overrode AP hold for invoice ${updated.invoiceNumber}`,
          overrideNote: note,
        },
      });

      return NextResponse.json(updated);
    }

    if (action === "clear_override") {
      if (!access.hasGlobal("supplier_payments.override_hold")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.supplierInvoice.update({
          where: { id: supplierInvoiceId },
          data: {
            paymentHoldStatus: "HELD",
            paymentHoldOverrideNote: null,
            paymentHoldReleasedAt: null,
            paymentHoldReleasedById: null,
          },
        });
        await evaluateSupplierInvoiceApControls(tx, supplierInvoiceId, access.userId);
        return tx.supplierInvoice.findUniqueOrThrow({
          where: { id: supplierInvoiceId },
          include: supplierInvoiceInclude,
        });
      });

      await logActivity({
        action: "clear_override",
        entity: "supplier_invoice",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Cleared AP hold override for invoice ${updated.invoiceNumber}`,
        },
      });

      return NextResponse.json(updated);
    }

    if (action === "apply_credit") {
      if (!access.hasGlobal("supplier_invoices.manage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const invoice = await tx.supplierInvoice.findUnique({
          where: { id: supplierInvoiceId },
          include: {
            supplier: {
              select: {
                id: true,
                currency: true,
              },
            },
          },
        });
        if (!invoice) throw new Error("Supplier invoice not found.");
        if (invoice.slaCreditStatus !== "RECOMMENDED" || invoice.slaRecommendedCredit.lte(0)) {
          throw new Error("No SLA credit recommendation is available to apply.");
        }

        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: invoice.supplierId,
            entryDate: new Date(),
            entryType: "ADJUSTMENT",
            direction: "CREDIT",
            amount: invoice.slaRecommendedCredit,
            currency: invoice.currency || invoice.supplier.currency || "BDT",
            note:
              note ||
              `Applied SLA credit recommendation for supplier invoice ${invoice.invoiceNumber}.`,
            referenceType: "SLA_CREDIT",
            referenceNumber: invoice.invoiceNumber,
            supplierInvoiceId: invoice.id,
            createdById: access.userId,
          },
        });

        await tx.supplierInvoice.update({
          where: { id: invoice.id },
          data: {
            slaCreditStatus: "APPLIED",
            slaCreditUpdatedAt: new Date(),
            slaCreditReason:
              note ||
              invoice.slaCreditReason ||
              "SLA credit recommendation applied.",
          },
        });

        await syncSupplierInvoicePaymentStatus(tx, invoice.id);
        await evaluateSupplierInvoiceApControls(tx, invoice.id, access.userId);

        return tx.supplierInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          include: supplierInvoiceInclude,
        });
      });

      await logActivity({
        action: "apply_credit",
        entity: "supplier_invoice",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Applied SLA credit for invoice ${updated.invoiceNumber}`,
          amount: updated.slaRecommendedCredit.toString(),
        },
      });

      return NextResponse.json(updated);
    }

    if (action === "waive_credit") {
      if (!access.hasGlobal("supplier_invoices.manage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (note.length < 3) {
        return NextResponse.json(
          { error: "Waiver note (minimum 3 characters) is required." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const invoice = await tx.supplierInvoice.findUnique({
          where: { id: supplierInvoiceId },
          select: { id: true },
        });
        if (!invoice) throw new Error("Supplier invoice not found.");

        await tx.supplierInvoice.update({
          where: { id: invoice.id },
          data: {
            slaCreditStatus: "WAIVED",
            slaCreditUpdatedAt: new Date(),
            slaCreditReason: note,
          },
        });
        await evaluateSupplierInvoiceApControls(tx, invoice.id, access.userId);

        return tx.supplierInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          include: supplierInvoiceInclude,
        });
      });

      await logActivity({
        action: "waive_credit",
        entity: "supplier_invoice",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Waived SLA credit for invoice ${updated.invoiceNumber}`,
          note,
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json(
      {
        error:
          "Unsupported action. Use one of: reevaluate, override_hold, clear_override, apply_credit, waive_credit.",
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("SUPPLIER INVOICE HOLD PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update supplier invoice AP controls." },
      { status: 500 },
    );
  }
}
