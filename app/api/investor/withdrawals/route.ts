import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveInvestorRequestContext } from "@/app/api/investor/shared";
import {
  buildInvestorWithdrawalSnapshot,
  computeInvestorWithdrawalMetrics,
  generateInvestorWithdrawalRequestNumber,
  serializeInvestorWithdrawalRequest,
} from "@/lib/investor-withdrawals";
import { createInvestorPortalNotification } from "@/lib/investor-portal-notifications";
import { createInvestorInternalNotificationsForPermissions } from "@/lib/investor-internal-notifications";

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

function parseOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET() {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("investor.portal.withdrawals.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [investor, metrics, rows] = await prisma.$transaction(async (tx) => {
      const currentInvestor = await tx.investor.findUnique({
        where: { id: resolved.context.investorId },
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
          beneficiaryVerificationNote: true,
        },
      });
      const currentMetrics = await computeInvestorWithdrawalMetrics(
        tx,
        resolved.context.investorId,
      );
      const requests = await tx.investorWithdrawalRequest.findMany({
        where: { investorId: resolved.context.investorId },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 20,
        include: {
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
      return [currentInvestor, currentMetrics, requests] as const;
    });

    if (!investor) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    return NextResponse.json({
      investor: {
        ...investor,
        beneficiaryVerifiedAt: investor.beneficiaryVerifiedAt?.toISOString() ?? null,
      },
      metrics: buildInvestorWithdrawalSnapshot(metrics),
      requests: rows.map((row) => serializeInvestorWithdrawalRequest(row)),
    });
  } catch (error) {
    console.error("INVESTOR WITHDRAWALS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor withdrawals." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("investor.portal.withdrawals.submit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedAmount = toDecimalAmount(body.amount, "Withdrawal amount");
    const requestedSettlementDate = parseOptionalDate(body.requestedSettlementDate);
    const requestNote = toCleanText(body.requestNote, 500);

    if (requestedAmount.lte(0)) {
      return NextResponse.json(
        { error: "Withdrawal amount must be greater than zero." },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const investor = await tx.investor.findUnique({
        where: { id: resolved.context.investorId },
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
      });

      if (!investor) {
        throw new Error("Investor not found.");
      }
      if (investor.status !== "ACTIVE") {
        throw new Error("Only ACTIVE investors can submit withdrawal requests.");
      }
      if (investor.kycStatus !== "VERIFIED") {
        throw new Error("KYC must be VERIFIED before withdrawal request submission.");
      }
      if (!investor.beneficiaryVerifiedAt) {
        throw new Error(
          "Beneficiary must be verified before submitting a withdrawal request.",
        );
      }

      const pendingCount = await tx.investorWithdrawalRequest.count({
        where: {
          investorId: investor.id,
          status: { in: ["REQUESTED", "APPROVED"] },
        },
      });
      if (pendingCount >= 3) {
        throw new Error(
          "Too many open withdrawal requests. Wait for review or settlement first.",
        );
      }

      const metrics = await computeInvestorWithdrawalMetrics(tx, investor.id);
      if (requestedAmount.gt(metrics.withdrawableBalance)) {
        throw new Error(
          "Requested withdrawal exceeds current withdrawable balance after commitments and pending settlements.",
        );
      }

      const requestNumber = await generateInvestorWithdrawalRequestNumber(tx);
      const createdRow = await tx.investorWithdrawalRequest.create({
        data: {
          requestNumber,
          investorId: investor.id,
          requestedAmount,
          currency: "BDT",
          availableBalanceSnapshot: metrics.availableBalance,
          activeCommittedAmountSnapshot: metrics.activeCommittedAmount,
          pendingPayoutAmountSnapshot: metrics.pendingPayoutAmount,
          withdrawableBalanceSnapshot: metrics.withdrawableBalance,
          beneficiaryNameSnapshot: investor.bankAccountName || investor.name,
          beneficiaryBankNameSnapshot: investor.bankName || null,
          beneficiaryAccountNumberSnapshot: investor.bankAccountNumber || null,
          beneficiaryVerifiedAt: investor.beneficiaryVerifiedAt,
          requestedSettlementDate,
          requestNote: requestNote || null,
          submittedById: resolved.context.userId,
        },
        include: {
          investor: {
            select: { id: true, code: true, name: true, status: true, kycStatus: true },
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
          investorId: investor.id,
          type: "WITHDRAWAL_REQUEST",
          title: "Withdrawal Request Submitted",
          message:
            "Your withdrawal request was submitted and is waiting for internal review.",
          targetUrl: "/investor/withdrawals",
          metadata: {
            withdrawalRequestId: createdRow.id,
            requestNumber: createdRow.requestNumber,
          },
          createdById: resolved.context.userId,
        },
      });

      await createInvestorInternalNotificationsForPermissions({
        tx,
        permissionKeys: ["investor_withdrawals.review", "investors.manage"],
        notification: {
          type: "WITHDRAWAL",
          title: "Investor Withdrawal Request Submitted",
          message: `${investor.name} (${investor.code}) submitted withdrawal request ${requestNumber}.`,
          targetUrl: "/admin/investors/withdrawals",
          entity: "investor_withdrawal_request",
          entityId: String(createdRow.id),
          metadata: {
            investorId: investor.id,
            investorCode: investor.code,
            requestNumber,
          },
          createdById: resolved.context.userId,
        },
        excludeUserIds: resolved.context.userId ? [resolved.context.userId] : [],
      });

      return {
        request: createdRow,
        metrics,
      };
    });

    return NextResponse.json(
      {
        request: serializeInvestorWithdrawalRequest(created.request),
        metrics: buildInvestorWithdrawalSnapshot(created.metrics),
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("INVESTOR WITHDRAWALS POST ERROR:", error);
    const message = String(error?.message || "");
    if (
      message.includes("required") ||
      message.includes("Only ") ||
      message.includes("must ") ||
      message.includes("Too many") ||
      message.includes("exceeds")
    ) {
      return NextResponse.json(
        { error: message || "Invalid withdrawal request." },
        { status: 400 },
      );
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message || "Investor not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: message || "Failed to submit withdrawal request." },
      { status: 500 },
    );
  }
}
