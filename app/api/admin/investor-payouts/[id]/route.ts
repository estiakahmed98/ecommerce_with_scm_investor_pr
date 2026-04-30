import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  computeInvestorLedgerTotals,
  generateInvestorTransactionNumber,
  parseInvestorPayoutPaymentMethod,
  toCleanText,
} from "@/lib/investor";
import {
  hasVerifiedInvestorBeneficiary,
  parsePayoutProofUrl,
  payoutIsOnHold,
} from "@/lib/investor-payout";
import { createInvestorPortalNotification } from "@/lib/investor-portal-notifications";
import { createInvestorInternalNotificationsForPermissions } from "@/lib/investor-internal-notifications";

function canReadPayout(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("investor_payout.read") ||
    access.hasGlobal("investor_payout.manage") ||
    access.hasGlobal("investor_payout.approve") ||
    access.hasGlobal("investor_payout.pay") ||
    access.hasGlobal("investor_payout.void") ||
    access.hasGlobal("investor_statement.read")
  );
}

function canManagePayout(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_payout.manage");
}

function canApprovePayout(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_payout.approve");
}

function canPayPayout(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_payout.pay");
}

function canVoidPayout(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_payout.void");
}

function serializePayout(payout: any) {
  return {
    ...payout,
    payoutPercent: payout.payoutPercent.toString(),
    holdbackPercent: payout.holdbackPercent.toString(),
    grossProfitAmount: payout.grossProfitAmount.toString(),
    holdbackAmount: payout.holdbackAmount.toString(),
    payoutAmount: payout.payoutAmount.toString(),
    beneficiaryVerifiedAt: payout.beneficiaryVerifiedAt?.toISOString() ?? null,
    approvedAt: payout.approvedAt?.toISOString() ?? null,
    rejectedAt: payout.rejectedAt?.toISOString() ?? null,
    heldAt: payout.heldAt?.toISOString() ?? null,
    paidAt: payout.paidAt?.toISOString() ?? null,
    releasedAt: payout.releasedAt?.toISOString() ?? null,
    paymentProofUploadedAt: payout.paymentProofUploadedAt?.toISOString() ?? null,
    voidedAt: payout.voidedAt?.toISOString() ?? null,
    createdAt: payout.createdAt.toISOString(),
    updatedAt: payout.updatedAt.toISOString(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadPayout(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const payoutId = Number(id);
    if (!Number.isInteger(payoutId) || payoutId <= 0) {
      return NextResponse.json({ error: "Invalid payout id." }, { status: 400 });
    }

    const payout = await prisma.investorProfitPayout.findUnique({
      where: { id: payoutId },
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            bankName: true,
            bankAccountName: true,
            bankAccountNumber: true,
            beneficiaryVerifiedAt: true,
            beneficiaryVerificationNote: true,
          },
        },
        run: {
          select: {
            id: true,
            runNumber: true,
            status: true,
            fromDate: true,
            toDate: true,
          },
        },
        transaction: {
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            amount: true,
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        rejectedBy: { select: { id: true, name: true, email: true } },
        paidBy: { select: { id: true, name: true, email: true } },
        releasedBy: { select: { id: true, name: true, email: true } },
        voidedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!payout) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }

    const recentActivity = await prisma.activityLog.findMany({
      where: {
        entity: "investor_profit_payout",
        entityId: String(payout.id),
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        metadata: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      payout: {
        ...serializePayout(payout),
        transaction: payout.transaction
          ? {
              ...payout.transaction,
              amount: payout.transaction.amount.toString(),
              transactionDate: payout.transaction.transactionDate.toISOString(),
            }
          : null,
        run: {
          ...payout.run,
          fromDate: payout.run.fromDate.toISOString(),
          toDate: payout.run.toDate.toISOString(),
        },
      },
      readiness: {
        beneficiaryVerified:
          Boolean(payout.beneficiaryVerifiedAt) &&
          Boolean(payout.beneficiaryBankNameSnapshot) &&
          Boolean(payout.beneficiaryAccountNumberSnapshot),
        onHold: payoutIsOnHold(payout),
        canPay: payout.status === "APPROVED" && !payoutIsOnHold(payout),
      },
      recentActivity: recentActivity.map((item) => ({
        id: item.id.toString(),
        action: item.action,
        entity: item.entity,
        entityId: item.entityId,
        createdAt: item.createdAt.toISOString(),
        actorName: item.user?.name ?? null,
        actorEmail: item.user?.email ?? null,
        metadata: item.metadata as { message?: string } | null,
      })),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR PAYOUT GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor payout detail." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const payoutId = Number(id);
    if (!Number.isInteger(payoutId) || payoutId <= 0) {
      return NextResponse.json({ error: "Invalid payout id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    if (!["approve", "reject", "hold", "release", "pay", "void"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Use approve/reject/hold/release/pay/void." },
        { status: 400 },
      );
    }

    const payout = await prisma.investorProfitPayout.findUnique({
      where: { id: payoutId },
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            bankName: true,
            bankAccountName: true,
            bankAccountNumber: true,
            beneficiaryVerifiedAt: true,
            beneficiaryVerificationNote: true,
          },
        },
      },
    });
    if (!payout) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }

    if (action === "approve" || action === "reject") {
      if (!canApprovePayout(access)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (payout.status !== "PENDING_APPROVAL") {
        return NextResponse.json(
          { error: "Only PENDING_APPROVAL payout can be approved/rejected." },
          { status: 400 },
        );
      }
      if (payout.createdById && payout.createdById === access.userId) {
        return NextResponse.json(
          { error: "Maker-checker policy: creator cannot approve/reject own payout." },
          { status: 403 },
        );
      }

      const note = toCleanText(body.note, 500) || null;
      if (action === "reject" && !note) {
        return NextResponse.json(
          { error: "Rejection note is required." },
          { status: 400 },
        );
      }
      if (action === "approve") {
        const verified = hasVerifiedInvestorBeneficiary(payout.investor);
        if (!verified || !payout.beneficiaryVerifiedAt) {
          return NextResponse.json(
            { error: "Payout beneficiary must be verified before approval." },
            { status: 400 },
          );
        }
      }

      const now = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.investorProfitPayout.update({
          where: { id: payout.id },
          data:
            action === "approve"
              ? {
                  status: "APPROVED",
                  approvedById: access.userId,
                  approvedAt: now,
                  approvalNote: note,
                  rejectedById: null,
                  rejectedAt: null,
                  rejectionReason: null,
                }
              : {
                  status: "REJECTED",
                  rejectedById: access.userId,
                  rejectedAt: now,
                  rejectionReason: note,
                  approvedById: null,
                  approvedAt: null,
                },
        });
        await createInvestorPortalNotification({
          tx,
          notification: {
            investorId: payout.investorId,
            type: "PAYOUT_STATUS",
            title: action === "approve" ? "Payout Approved" : "Payout Rejected",
            message:
              action === "approve"
                ? `Payout ${next.payoutNumber} was approved.`
                : `Payout ${next.payoutNumber} was rejected.${note ? ` Note: ${note}` : ""}`,
            targetUrl: "/investor/payouts",
            metadata: { payoutId: next.id, payoutNumber: next.payoutNumber, status: next.status },
            createdById: access.userId,
          },
        });
        if (action === "approve") {
          await createInvestorInternalNotificationsForPermissions({
            tx,
            permissionKeys: ["investor_payout.pay"],
            notification: {
              type: "PAYOUT",
              title: "Investor Payout Ready To Pay",
              message: `${next.payoutNumber} was approved and is ready for settlement.`,
              targetUrl: `/admin/investors/payouts/${next.id}`,
              entity: "investor_profit_payout",
              entityId: String(next.id),
              metadata: {
                payoutId: next.id,
                payoutNumber: next.payoutNumber,
                status: next.status,
              },
              createdById: access.userId,
            },
            excludeUserIds: access.userId ? [access.userId] : [],
          });
        }
        return next;
      });

      await logActivity({
        action,
        entity: "investor_profit_payout",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message:
            action === "approve"
              ? `Approved payout ${updated.payoutNumber}`
              : `Rejected payout ${updated.payoutNumber}`,
          note,
        },
      });

      return NextResponse.json({ payout: serializePayout(updated) });
    }

    if (action === "hold" || action === "release") {
      if (!(canManagePayout(access) || canApprovePayout(access) || canPayPayout(access))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["APPROVED", "PENDING_APPROVAL"].includes(payout.status)) {
        return NextResponse.json(
          { error: "Only pending/approved payouts can be held or released." },
          { status: 400 },
        );
      }

      const note =
        toCleanText(
          action === "hold" ? body.holdReason : body.releaseNote,
          500,
        ) || null;

      if (!note) {
        return NextResponse.json(
          {
            error:
              action === "hold"
                ? "Hold reason is required."
                : "Release note is required.",
          },
          { status: 400 },
        );
      }

      if (action === "release" && !payoutIsOnHold(payout)) {
        return NextResponse.json({ error: "Payout is not currently on hold." }, { status: 400 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.investorProfitPayout.update({
          where: { id: payout.id },
          data:
            action === "hold"
              ? {
                  holdReason: note,
                  heldAt: new Date(),
                  releasedAt: null,
                  releasedById: null,
                  releaseNote: null,
                }
              : {
                  releasedAt: new Date(),
                  releasedById: access.userId,
                  releaseNote: note,
                },
        });
        await createInvestorPortalNotification({
          tx,
          notification: {
            investorId: payout.investorId,
            type: "PAYOUT_STATUS",
            title: action === "hold" ? "Payout On Hold" : "Payout Hold Released",
            message:
              action === "hold"
                ? `Payout ${next.payoutNumber} was placed on hold.${note ? ` Reason: ${note}` : ""}`
                : `Payout ${next.payoutNumber} hold was released.${note ? ` Note: ${note}` : ""}`,
            targetUrl: "/investor/payouts",
            metadata: { payoutId: next.id, payoutNumber: next.payoutNumber, status: next.status },
            createdById: access.userId,
          },
        });
        return next;
      });

      await logActivity({
        action,
        entity: "investor_profit_payout",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message:
            action === "hold"
              ? `Placed payout ${updated.payoutNumber} on hold`
              : `Released payout ${updated.payoutNumber} from hold`,
          note,
        },
      });

      return NextResponse.json({ payout: serializePayout(updated) });
    }

    if (action === "pay") {
      if (!canPayPayout(access)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (payout.status !== "APPROVED") {
        return NextResponse.json(
          { error: "Only APPROVED payout can be paid." },
          { status: 400 },
        );
      }
      if (payoutIsOnHold(payout)) {
        return NextResponse.json(
          { error: "Release the payout hold before payment." },
          { status: 400 },
        );
      }

      const verified = hasVerifiedInvestorBeneficiary(payout.investor);
      if (!verified || !payout.beneficiaryVerifiedAt) {
        return NextResponse.json(
          { error: "Verified beneficiary snapshot is required before payment." },
          { status: 400 },
        );
      }

      const paymentMethod = parseInvestorPayoutPaymentMethod(body.paymentMethod);
      const bankReference = toCleanText(body.bankReference, 120) || null;
      const note = toCleanText(body.note, 500) || null;
      const paymentProofUrl = parsePayoutProofUrl(body.paymentProofUrl);
      if (!paymentProofUrl) {
        return NextResponse.json(
          { error: "Payment proof upload is required before marking payout as paid." },
          { status: 400 },
        );
      }

      const paidAtInput = body.paidAt ? new Date(String(body.paidAt)) : new Date();
      if (Number.isNaN(paidAtInput.getTime())) {
        return NextResponse.json({ error: "Invalid paid date." }, { status: 400 });
      }

      const result = await prisma.$transaction(async (tx) => {
        const investor = await tx.investor.findUnique({
          where: { id: payout.investorId },
          select: {
            id: true,
            status: true,
            bankName: true,
            bankAccountName: true,
            bankAccountNumber: true,
            beneficiaryVerifiedAt: true,
          },
        });
        if (!investor || investor.status !== "ACTIVE") {
          throw new Error("Only ACTIVE investors can receive payout settlement.");
        }
        if (!hasVerifiedInvestorBeneficiary(investor)) {
          throw new Error("Investor beneficiary is not verified.");
        }

        const grouped = await tx.investorCapitalTransaction.groupBy({
          by: ["direction"],
          where: { investorId: payout.investorId },
          _sum: { amount: true },
        });
        const totals = computeInvestorLedgerTotals(
          grouped.map((item) => ({
            direction: item.direction,
            amount: item._sum.amount ?? new Prisma.Decimal(0),
          })),
        );
        if (payout.payoutAmount.gt(totals.balance)) {
          throw new Error("Payout exceeds available investor balance.");
        }

        const transactionNumber = await generateInvestorTransactionNumber(tx, paidAtInput);
        const transaction = await tx.investorCapitalTransaction.create({
          data: {
            transactionNumber,
            investorId: payout.investorId,
            transactionDate: paidAtInput,
            type: "DISTRIBUTION",
            direction: "DEBIT",
            amount: payout.payoutAmount,
            currency: payout.currency,
            note: note || `Settlement for payout ${payout.payoutNumber}.`,
            referenceType: "INVESTOR_PROFIT_PAYOUT",
            referenceNumber: payout.payoutNumber,
            productVariantId: null,
            createdById: access.userId,
          },
        });

        const updated = await tx.investorProfitPayout.update({
          where: { id: payout.id },
          data: {
            status: "PAID",
            transactionId: transaction.id,
            paidById: access.userId,
            paymentMethod,
            bankReference,
            note,
            paidAt: paidAtInput,
            paymentProofUrl,
            paymentProofUploadedAt: new Date(),
          },
        });

        await createInvestorPortalNotification({
          tx,
          notification: {
            investorId: payout.investorId,
            type: "PAYOUT_STATUS",
            title: "Payout Paid",
            message: `Payout ${updated.payoutNumber} was marked as paid.`,
            targetUrl: "/investor/payouts",
            metadata: { payoutId: updated.id, payoutNumber: updated.payoutNumber, status: updated.status },
            createdById: access.userId,
          },
        });

        return { transactionNumber: transaction.transactionNumber, updated };
      });

      await logActivity({
        action: "pay",
        entity: "investor_profit_payout",
        entityId: payout.id,
        access,
        request,
        metadata: {
          message: `Settled payout ${payout.payoutNumber}`,
          transactionNumber: result.transactionNumber,
        },
      });

      return NextResponse.json({
        payout: serializePayout(result.updated),
        transactionNumber: result.transactionNumber,
      });
    }

    if (!canVoidPayout(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["APPROVED", "PAID"].includes(payout.status)) {
      return NextResponse.json(
        { error: "Only APPROVED or PAID payout can be voided." },
        { status: 400 },
      );
    }
    const voidReason = toCleanText(body.voidReason, 500) || "Voided by authorized reviewer.";

    const voided = await prisma.$transaction(async (tx) => {
      let reversalReference: string | null = null;
      if (payout.status === "PAID") {
        const reversalNumber = await generateInvestorTransactionNumber(tx, new Date());
        await tx.investorCapitalTransaction.create({
          data: {
            transactionNumber: reversalNumber,
            investorId: payout.investorId,
            transactionDate: new Date(),
            type: "ADJUSTMENT",
            direction: "CREDIT",
            amount: payout.payoutAmount,
            currency: payout.currency,
            note: `Void reversal for payout ${payout.payoutNumber}. ${voidReason}`,
            referenceType: "INVESTOR_PAYOUT_VOID_REVERSAL",
            referenceNumber: payout.payoutNumber,
            productVariantId: null,
            createdById: access.userId,
          },
        });
        reversalReference = reversalNumber;
      }

      const updated = await tx.investorProfitPayout.update({
        where: { id: payout.id },
        data: {
          status: "VOID",
          voidedById: access.userId,
          voidedAt: new Date(),
          voidReason,
          voidReversalReference: reversalReference,
        },
      });

      await createInvestorPortalNotification({
        tx,
        notification: {
          investorId: payout.investorId,
          type: "PAYOUT_STATUS",
          title: "Payout Voided",
          message: `Payout ${updated.payoutNumber} was voided.${voidReason ? ` Note: ${voidReason}` : ""}`,
          targetUrl: "/investor/payouts",
          metadata: { payoutId: updated.id, payoutNumber: updated.payoutNumber, status: updated.status },
          createdById: access.userId,
        },
      });

      return updated;
    });

    await logActivity({
      action: "void",
      entity: "investor_profit_payout",
      entityId: payout.id,
      access,
      request,
      metadata: {
        message: `Voided payout ${payout.payoutNumber}`,
        voidReason,
        reversalReference: voided.voidReversalReference,
      },
    });

    return NextResponse.json({ payout: serializePayout(voided) });
  } catch (error: any) {
    console.error("ADMIN INVESTOR PAYOUT PATCH ERROR:", error);
    const message = String(error?.message || "");
    if (
      message.includes("Invalid") ||
      message.includes("Only") ||
      message.includes("Maker-checker") ||
      message.includes("exceeds") ||
      message.includes("ACTIVE investors") ||
      message.includes("required") ||
      message.includes("verified")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message || "Failed to process payout action." }, { status: 500 });
  }
}
