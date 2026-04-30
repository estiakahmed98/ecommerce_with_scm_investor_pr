import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateSupplierPaymentNumber,
  syncSupplierInvoicePaymentStatus,
  toDecimalAmount,
  toSupplierPaymentLogSnapshot,
} from "@/lib/scm";
import { evaluateSupplierInvoiceApControls } from "@/lib/supplier-sla";

function toCleanText(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadSupplierPayments(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("supplier_ledger.read") || access.hasGlobal("supplier_payments.read") || access.hasGlobal("supplier_payments.manage");
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
    if (!canReadSupplierPayments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const payments = await prisma.supplierPayment.findMany({
      where: {
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
      },
      orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
      include: {
        supplier: {
          select: { id: true, name: true, code: true },
        },
        supplierInvoice: {
          select: { id: true, invoiceNumber: true, total: true, status: true },
        },
      },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("SUPPLIER PAYMENTS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier payments." }, { status: 500 });
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
    if (!access.hasGlobal("supplier_payments.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      supplierId?: unknown;
      supplierInvoiceId?: unknown;
      paymentDate?: unknown;
      amount?: unknown;
      currency?: unknown;
      method?: unknown;
      reference?: unknown;
      note?: unknown;
      holdOverride?: unknown;
      holdOverrideNote?: unknown;
    };

    const supplierId = Number(body.supplierId);
    const supplierInvoiceId =
      body.supplierInvoiceId === null || body.supplierInvoiceId === undefined || body.supplierInvoiceId === ""
        ? null
        : Number(body.supplierInvoiceId);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }
    if (supplierInvoiceId !== null && (!Number.isInteger(supplierInvoiceId) || supplierInvoiceId <= 0)) {
      return NextResponse.json({ error: "Invalid supplier invoice." }, { status: 400 });
    }

    const paymentDate = body.paymentDate ? new Date(String(body.paymentDate)) : new Date();
    if (Number.isNaN(paymentDate.getTime())) {
      return NextResponse.json({ error: "Invalid payment date." }, { status: 400 });
    }

    const amount = toDecimalAmount(body.amount, "Payment amount");
    if (amount.lte(0)) {
      return NextResponse.json({ error: "Payment amount must be greater than 0." }, { status: 400 });
    }

    const holdOverrideRequested = body.holdOverride === true;
    const holdOverrideNote = toCleanText(body.holdOverrideNote, 500);

    const [supplier, invoice] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true, code: true, currency: true },
      }),
      supplierInvoiceId
        ? prisma.supplierInvoice.findUnique({
            where: { id: supplierInvoiceId },
            include: {
              payments: {
                select: { amount: true },
              },
              ledgerEntries: {
                where: {
                  entryType: "ADJUSTMENT",
                  direction: "CREDIT",
                },
                select: {
                  amount: true,
                },
              },
              purchaseOrder: {
                select: {
                  id: true,
                  poNumber: true,
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);

    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }
    if (supplierInvoiceId && !invoice) {
      return NextResponse.json({ error: "Supplier invoice not found." }, { status: 404 });
    }
    if (invoice && invoice.supplierId !== supplierId) {
      return NextResponse.json(
        { error: "Selected invoice does not belong to the supplier." },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      if (invoice && supplierInvoiceId) {
        const reEvaluatedInvoice = await evaluateSupplierInvoiceApControls(
          tx,
          supplierInvoiceId,
          access.userId,
        );

        if (reEvaluatedInvoice.paymentHoldStatus === "HELD") {
          if (!holdOverrideRequested) {
            throw new Error(
              reEvaluatedInvoice.paymentHoldReason ||
                "Payment is blocked by SLA/AP hold policy. Use an override note if policy allows.",
            );
          }
          if (!access.hasGlobal("supplier_payments.override_hold")) {
            throw new Error(
              "You do not have permission to override held supplier invoice payments.",
            );
          }
          if (holdOverrideNote.trim().length < 3) {
            throw new Error(
              "Hold override note (minimum 3 characters) is required.",
            );
          }

          const activePolicy = await tx.supplierSlaPolicy.findFirst({
            where: {
              supplierId,
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
              paymentHoldOverrideNote: holdOverrideNote,
            },
          });
        }

        const latestInvoiceBalance = await tx.supplierInvoice.findUnique({
          where: { id: supplierInvoiceId },
          select: {
            status: true,
            total: true,
            payments: {
              select: {
                amount: true,
              },
            },
            ledgerEntries: {
              where: {
                entryType: "ADJUSTMENT",
                direction: "CREDIT",
              },
              select: {
                amount: true,
              },
            },
          },
        });
        if (!latestInvoiceBalance) {
          throw new Error("Supplier invoice not found.");
        }
        if (latestInvoiceBalance.status === "CANCELLED") {
          throw new Error("Cannot post payment against a cancelled supplier invoice.");
        }
        if (latestInvoiceBalance.status === "PAID") {
          throw new Error("Supplier invoice is already fully settled.");
        }

        const paidSoFar = latestInvoiceBalance.payments.reduce(
          (sum, item) => sum.plus(item.amount),
          new Prisma.Decimal(0),
        );
        const adjustmentCredit = latestInvoiceBalance.ledgerEntries.reduce(
          (sum, entry) => sum.plus(entry.amount),
          new Prisma.Decimal(0),
        );
        const outstanding = latestInvoiceBalance.total
          .minus(paidSoFar)
          .minus(adjustmentCredit);
        if (amount.gt(outstanding)) {
          throw new Error("Payment exceeds the invoice outstanding amount.");
        }
      }

      const paymentNumber = await generateSupplierPaymentNumber(tx);
      const payment = await tx.supplierPayment.create({
        data: {
          paymentNumber,
          supplierId,
          supplierInvoiceId,
          paymentDate,
          createdById: access.userId,
          amount,
          currency: toCleanText(body.currency, 3).toUpperCase() || supplier.currency || "BDT",
          method: (toCleanText(body.method, 40) || "BANK_TRANSFER") as any,
          reference: toCleanText(body.reference, 120) || null,
          note: toCleanText(body.note, 500) || null,
        },
      });

      await tx.supplierLedgerEntry.create({
        data: {
          supplierId,
          entryDate: paymentDate,
          entryType: "PAYMENT",
          direction: "CREDIT",
          amount,
          currency: payment.currency,
          note: payment.note,
          referenceType: "SUPPLIER_PAYMENT",
          referenceNumber: payment.paymentNumber,
          supplierInvoiceId,
          supplierPaymentId: payment.id,
          createdById: access.userId,
        },
      });

      if (supplierInvoiceId) {
        await syncSupplierInvoicePaymentStatus(tx, supplierInvoiceId);
      }

      return payment;
    });

    await logActivity({
      action: "create",
      entity: "supplier_payment",
      entityId: created.id,
      access,
      request,
          metadata: {
            message: `Created supplier payment ${created.paymentNumber}`,
            holdOverrideUsed: holdOverrideRequested,
          },
          after: toSupplierPaymentLogSnapshot(created),
        });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SUPPLIER PAYMENTS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create supplier payment." },
      { status: 500 },
    );
  }
}
