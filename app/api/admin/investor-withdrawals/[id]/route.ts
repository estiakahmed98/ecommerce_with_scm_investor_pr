import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  buildInvestorWithdrawalSnapshot,
  computeInvestorWithdrawalMetrics,
  serializeInvestorWithdrawalRequest,
} from "@/lib/investor-withdrawals";
import { createInvestorPortalNotification } from "@/lib/investor-portal-notifications";
import { createInvestorInternalNotificationsForPermissions } from "@/lib/investor-internal-notifications";
import { generateInvestorTransactionNumber } from "@/lib/investor";

function canReadInvestorWithdrawals(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return (
    access.hasGlobal("investor_withdrawals.read") ||
    access.hasGlobal("investor_withdrawals.review") ||
    access.hasGlobal("investor_withdrawals.settle") ||
    access.hasGlobal("investors.manage")
  );
}

function canReviewInvestorWithdrawals(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasGlobal("investor_withdrawals.review") || access.hasGlobal("investors.manage");
}

function canSettleInvestorWithdrawals(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasGlobal("investor_withdrawals.settle");
}

function toDecimalAmount(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${label} is required.`);
  }
  try {
    const decimal = new Prisma.Decimal(value as Prisma.Decimal.Value);
    if (!decimal.isFinite()) {
      throw new Error(`${label} must be a valid number.`);
    }
    return decimal;
  } catch {
    throw new Error(`${label} must be a valid number.`);
  }
}

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getRequestWithRelations(requestId: number) {
  return prisma.investorWithdrawalRequest.findUnique({
    where: { id: requestId },
    include: {
      investor: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          kycStatus: true,
          bankName: true,
          bankAccountName: true,
          bankAccountNumber: true,
          beneficiaryVerifiedAt: true,
        },
      },
      submittedBy: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      settledBy: { select: { id: true, name: true, email: true } },
      transaction: {
        select: {
          id: true,
          transactionNumber: true,
          transactionDate: true,
          amount: true,
          direction: true,
          type: true,
        },
      },
    },
  });
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
    if (!canReadInvestorWithdrawals(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal request id." }, { status: 400 });
    }

    const row = await getRequestWithRelations(requestId);
    if (!row) {
      return NextResponse.json({ error: "Withdrawal request not found." }, { status: 404 });
    }

    const metrics = await prisma.$transaction((tx) =>
      computeInvestorWithdrawalMetrics(tx, row.investorId),
    );

    return NextResponse.json({
      request: serializeInvestorWithdrawalRequest(row),
      metrics: buildInvestorWithdrawalSnapshot(metrics),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR WITHDRAWAL GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor withdrawal request." },
      { status: 500 },
    );
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
    const requestId = Number(id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal request id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const reviewNote = toCleanText(body.reviewNote, 500);
    const settlementNote = toCleanText(body.settlementNote, 500);

    if (!["approve", "reject", "settle"].includes(action)) {
      return NextResponse.json({ error: "Invalid withdrawal action." }, { status: 400 });
    }
    if ((action === "approve" || action === "reject") && !canReviewInvestorWithdrawals(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (action === "settle" && !canSettleInvestorWithdrawals(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await getRequestWithRelations(requestId);
    if (!existing) {
      return NextResponse.json({ error: "Withdrawal request not found." }, { status: 404 });
    }

    if (action === "approve" || action === "reject") {
      if (existing.status !== "REQUESTED") {
        return NextResponse.json(
          { error: "Only REQUESTED withdrawal requests can be reviewed." },
          { status: 400 },
        );
      }
      if (existing.submittedById && existing.submittedById === access.userId) {
        return NextResponse.json(
          {
            error: "Maker-checker policy: requester cannot review own withdrawal request.",
          },
          { status: 403 },
        );
      }
      if (action === "reject" && !reviewNote) {
        return NextResponse.json({ error: "Rejection note is required." }, { status: 400 });
      }

      const approvedAmountRaw =
        action === "approve"
          ? body.approvedAmount ?? existing.requestedAmount.toString()
          : existing.requestedAmount.toString();
      const approvedAmount = toDecimalAmount(
        approvedAmountRaw,
        action === "approve" ? "Approved amount" : "Requested amount",
      );

      const updated = await prisma.$transaction(async (tx) => {
        if (action === "approve") {
          const metrics = await computeInvestorWithdrawalMetrics(tx, existing.investorId, new Date(), {
            excludeRequestId: existing.id,
          });
          if (approvedAmount.lte(0)) {
            throw new Error("Approved amount must be greater than zero.");
          }
          if (approvedAmount.gt(existing.requestedAmount)) {
            throw new Error("Approved amount cannot exceed requested amount.");
          }
          if (approvedAmount.gt(metrics.withdrawableBalance)) {
            throw new Error(
              "Approved amount exceeds current withdrawable balance after commitments and pending settlements.",
            );
          }
        }

        const requestRow = await tx.investorWithdrawalRequest.update({
          where: { id: existing.id },
          data: {
            status: action === "approve" ? "APPROVED" : "REJECTED",
            approvedAmount: action === "approve" ? approvedAmount : null,
            reviewNote: reviewNote || null,
            rejectionReason: action === "reject" ? reviewNote : null,
            reviewedById: access.userId,
            reviewedAt: new Date(),
          },
          include: {
            investor: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                kycStatus: true,
              },
            },
            submittedBy: { select: { id: true, name: true, email: true } },
            reviewedBy: { select: { id: true, name: true, email: true } },
            settledBy: { select: { id: true, name: true, email: true } },
            transaction: {
              select: {
                id: true,
                transactionNumber: true,
                transactionDate: true,
                amount: true,
                direction: true,
                type: true,
              },
            },
          },
        });

        await createInvestorPortalNotification({
          tx,
          notification: {
            investorId: existing.investorId,
            type: "WITHDRAWAL_STATUS",
            title:
              action === "approve"
                ? "Withdrawal Request Approved"
                : "Withdrawal Request Rejected",
            message:
              action === "approve"
                ? `Withdrawal request ${existing.requestNumber} was approved for ${approvedAmount.toString()} ${existing.currency}.`
                : `Withdrawal request ${existing.requestNumber} was rejected.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
            targetUrl: "/investor/withdrawals",
            metadata: {
              withdrawalRequestId: existing.id,
              requestNumber: existing.requestNumber,
            },
            createdById: access.userId,
          },
        });

        if (action === "approve") {
          await createInvestorInternalNotificationsForPermissions({
            tx,
            permissionKeys: ["investor_withdrawals.settle"],
            notification: {
              type: "WITHDRAWAL",
              title: "Investor Withdrawal Approved",
              message: `${existing.investor.name} (${existing.investor.code}) withdrawal ${existing.requestNumber} is ready for settlement.`,
              targetUrl: "/admin/investors/withdrawals",
              entity: "investor_withdrawal_request",
              entityId: String(existing.id),
              metadata: {
                investorId: existing.investorId,
                requestNumber: existing.requestNumber,
              },
              createdById: access.userId,
            },
          });
        }

        return requestRow;
      });

      await logActivity({
        action,
        entity: "investor_withdrawal_request",
        entityId: String(updated.id),
        access,
        request,
        metadata: {
          message:
            action === "approve"
              ? `Approved investor withdrawal request ${updated.requestNumber}`
              : `Rejected investor withdrawal request ${updated.requestNumber}`,
          investorId: existing.investorId,
          requestNumber: updated.requestNumber,
        },
      });

      return NextResponse.json({
        request: serializeInvestorWithdrawalRequest(updated),
      });
    }

    if (existing.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Only APPROVED withdrawal requests can be settled." },
        { status: 400 },
      );
    }
    if (!settlementNote) {
      return NextResponse.json({ error: "Settlement note is required." }, { status: 400 });
    }

    const settled = await prisma.$transaction(async (tx) => {
      const current = await tx.investorWithdrawalRequest.findUnique({
        where: { id: existing.id },
        include: {
          investor: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              kycStatus: true,
              bankName: true,
              bankAccountName: true,
              bankAccountNumber: true,
              beneficiaryVerifiedAt: true,
            },
          },
        },
      });

      if (!current) {
        throw new Error("Withdrawal request not found.");
      }
      if (current.status !== "APPROVED") {
        throw new Error("Only APPROVED withdrawal requests can be settled.");
      }
      if (!current.approvedAmount || current.approvedAmount.lte(0)) {
        throw new Error("Approved withdrawal amount is missing.");
      }
      if (current.investor.status !== "ACTIVE") {
        throw new Error("Only ACTIVE investors can settle withdrawal requests.");
      }
      if (current.investor.kycStatus !== "VERIFIED") {
        throw new Error("Investor KYC must remain VERIFIED before settlement.");
      }
      if (!current.investor.beneficiaryVerifiedAt) {
        throw new Error("Beneficiary must remain verified before settlement.");
      }

      const metrics = await computeInvestorWithdrawalMetrics(tx, current.investorId, new Date(), {
        excludeRequestId: current.id,
      });
      if (current.approvedAmount.gt(metrics.withdrawableBalance)) {
        throw new Error(
          "Approved withdrawal exceeds current withdrawable balance after commitments and pending settlements.",
        );
      }

      const transactionNumber = await generateInvestorTransactionNumber(tx, new Date());
      const transaction = await tx.investorCapitalTransaction.create({
        data: {
          transactionNumber,
          investorId: current.investorId,
          transactionDate: new Date(),
          type: "WITHDRAWAL",
          direction: "DEBIT",
          amount: current.approvedAmount,
          currency: current.currency,
          note: settlementNote,
          referenceType: "INVESTOR_WITHDRAWAL_REQUEST",
          referenceNumber: current.requestNumber,
          createdById: access.userId,
        },
      });

      const requestRow = await tx.investorWithdrawalRequest.update({
        where: { id: current.id },
        data: {
          transactionId: transaction.id,
          status: "SETTLED",
          settlementNote,
          settledById: access.userId,
          settledAt: new Date(),
        },
        include: {
          investor: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              kycStatus: true,
            },
          },
          submittedBy: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true, email: true } },
          settledBy: { select: { id: true, name: true, email: true } },
          transaction: {
            select: {
              id: true,
              transactionNumber: true,
              transactionDate: true,
              amount: true,
              direction: true,
              type: true,
            },
          },
        },
      });

      await createInvestorPortalNotification({
        tx,
        notification: {
          investorId: current.investorId,
          type: "WITHDRAWAL_STATUS",
          title: "Withdrawal Settled",
          message: `Withdrawal request ${current.requestNumber} was settled and posted to your capital ledger.`,
          targetUrl: "/investor/withdrawals",
          metadata: {
            withdrawalRequestId: current.id,
            requestNumber: current.requestNumber,
            transactionId: transaction.id,
          },
          createdById: access.userId,
        },
      });

      return requestRow;
    });

    await logActivity({
      action: "settle",
      entity: "investor_withdrawal_request",
      entityId: String(settled.id),
      access,
      request,
      metadata: {
        message: `Settled investor withdrawal request ${settled.requestNumber}`,
        investorId: existing.investorId,
        requestNumber: settled.requestNumber,
      },
    });

    return NextResponse.json({
      request: serializeInvestorWithdrawalRequest(settled),
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR WITHDRAWAL PATCH ERROR:", error);
    const message = String(error?.message || "");
    if (
      message.includes("required") ||
      message.includes("Only ") ||
      message.includes("must ") ||
      message.includes("exceeds")
    ) {
      return NextResponse.json({ error: message || "Invalid request." }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message || "Not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: message || "Failed to update investor withdrawal request." },
      { status: 500 },
    );
  }
}
