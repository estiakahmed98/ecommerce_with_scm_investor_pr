import { Prisma } from "@/generated/prisma";

type TransactionClient = Prisma.TransactionClient;

export const INVESTOR_WITHDRAWAL_REQUEST_STATUS_VALUES = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "SETTLED",
  "CANCELLED",
] as const;

export type InvestorWithdrawalRequestStatusValue =
  (typeof INVESTOR_WITHDRAWAL_REQUEST_STATUS_VALUES)[number];

function asDecimal(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

export function decimalMaxZero(value: Prisma.Decimal) {
  return value.lt(0) ? new Prisma.Decimal(0) : value;
}

export async function generateInvestorWithdrawalRequestNumber(
  tx: TransactionClient,
  date = new Date(),
) {
  const prefix = `IWR-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const count = await tx.investorWithdrawalRequest.count({
    where: {
      requestNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function computeInvestorWithdrawalMetrics(
  tx: TransactionClient,
  investorId: number,
  asOf = new Date(),
  options?: { excludeRequestId?: number | null },
) {
  const [ledgerTotals, activeAllocations, pendingPayouts, pendingRequests] = await Promise.all([
    tx.investorCapitalTransaction.groupBy({
      by: ["direction"],
      where: { investorId },
      _sum: { amount: true },
    }),
    tx.investorProductAllocation.findMany({
      where: {
        investorId,
        status: "ACTIVE",
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      select: {
        committedAmount: true,
      },
    }),
    tx.investorProfitPayout.findMany({
      where: {
        investorId,
        status: { in: ["PENDING_APPROVAL", "APPROVED"] },
      },
      select: {
        payoutAmount: true,
      },
    }),
    tx.investorWithdrawalRequest.findMany({
      where: {
        investorId,
        status: { in: ["REQUESTED", "APPROVED"] },
        ...(options?.excludeRequestId
          ? { id: { not: options.excludeRequestId } }
          : {}),
      },
      select: {
        requestedAmount: true,
        approvedAmount: true,
      },
    }),
  ]);

  const credit = ledgerTotals
    .filter((row) => row.direction === "CREDIT")
    .reduce((sum, row) => sum.plus(asDecimal(row._sum.amount)), new Prisma.Decimal(0));
  const debit = ledgerTotals
    .filter((row) => row.direction === "DEBIT")
    .reduce((sum, row) => sum.plus(asDecimal(row._sum.amount)), new Prisma.Decimal(0));
  const availableBalance = credit.minus(debit);
  const activeCommittedAmount = activeAllocations.reduce(
    (sum, row) => sum.plus(asDecimal(row.committedAmount)),
    new Prisma.Decimal(0),
  );
  const pendingPayoutAmount = pendingPayouts.reduce(
    (sum, row) => sum.plus(asDecimal(row.payoutAmount)),
    new Prisma.Decimal(0),
  );
  const pendingWithdrawalAmount = pendingRequests.reduce(
    (sum, row) => sum.plus(asDecimal(row.approvedAmount ?? row.requestedAmount)),
    new Prisma.Decimal(0),
  );
  const withdrawableBalance = decimalMaxZero(
    availableBalance
      .minus(activeCommittedAmount)
      .minus(pendingPayoutAmount)
      .minus(pendingWithdrawalAmount),
  );

  return {
    credit,
    debit,
    availableBalance,
    activeCommittedAmount,
    pendingPayoutAmount,
    pendingWithdrawalAmount,
    withdrawableBalance,
  };
}

export function buildInvestorWithdrawalSnapshot(input: {
  availableBalance: Prisma.Decimal;
  activeCommittedAmount: Prisma.Decimal;
  pendingPayoutAmount: Prisma.Decimal;
  pendingWithdrawalAmount?: Prisma.Decimal;
  withdrawableBalance: Prisma.Decimal;
}) {
  return {
    availableBalance: input.availableBalance.toString(),
    activeCommittedAmount: input.activeCommittedAmount.toString(),
    pendingPayoutAmount: input.pendingPayoutAmount.toString(),
    pendingWithdrawalAmount: asDecimal(input.pendingWithdrawalAmount).toString(),
    withdrawableBalance: input.withdrawableBalance.toString(),
  };
}

export function serializeInvestorWithdrawalRequest(request: {
  id: number;
  requestNumber: string;
  investorId: number;
  transactionId: number | null;
  requestedAmount: Prisma.Decimal;
  approvedAmount: Prisma.Decimal | null;
  currency: string;
  availableBalanceSnapshot: Prisma.Decimal;
  activeCommittedAmountSnapshot: Prisma.Decimal;
  pendingPayoutAmountSnapshot: Prisma.Decimal;
  withdrawableBalanceSnapshot: Prisma.Decimal;
  beneficiaryNameSnapshot: string | null;
  beneficiaryBankNameSnapshot: string | null;
  beneficiaryAccountNumberSnapshot: string | null;
  beneficiaryVerifiedAt: Date | null;
  status: string;
  requestedSettlementDate: Date | null;
  requestNote: string | null;
  reviewNote: string | null;
  rejectionReason: string | null;
  settlementNote: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  investor?: {
    id: number;
    code: string;
    name: string;
    status?: string;
    kycStatus?: string;
  } | null;
  submittedBy?: { id: string; name: string | null; email: string } | null;
  reviewedBy?: { id: string; name: string | null; email: string } | null;
  settledBy?: { id: string; name: string | null; email: string } | null;
  transaction?: {
    id: number;
    transactionNumber: string;
    transactionDate: Date;
    amount: Prisma.Decimal;
    direction: string;
    type: string;
  } | null;
}) {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    investorId: request.investorId,
    transactionId: request.transactionId,
    requestedAmount: request.requestedAmount.toString(),
    approvedAmount: request.approvedAmount?.toString() ?? null,
    currency: request.currency,
    availableBalanceSnapshot: request.availableBalanceSnapshot.toString(),
    activeCommittedAmountSnapshot: request.activeCommittedAmountSnapshot.toString(),
    pendingPayoutAmountSnapshot: request.pendingPayoutAmountSnapshot.toString(),
    withdrawableBalanceSnapshot: request.withdrawableBalanceSnapshot.toString(),
    beneficiaryNameSnapshot: request.beneficiaryNameSnapshot,
    beneficiaryBankNameSnapshot: request.beneficiaryBankNameSnapshot,
    beneficiaryAccountNumberSnapshot: request.beneficiaryAccountNumberSnapshot,
    beneficiaryVerifiedAt: request.beneficiaryVerifiedAt?.toISOString() ?? null,
    status: request.status,
    requestedSettlementDate: request.requestedSettlementDate?.toISOString() ?? null,
    requestNote: request.requestNote,
    reviewNote: request.reviewNote,
    rejectionReason: request.rejectionReason,
    settlementNote: request.settlementNote,
    submittedAt: request.submittedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    settledAt: request.settledAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    investor: request.investor ?? null,
    submittedBy: request.submittedBy ?? null,
    reviewedBy: request.reviewedBy ?? null,
    settledBy: request.settledBy ?? null,
    transaction: request.transaction
      ? {
          id: request.transaction.id,
          transactionNumber: request.transaction.transactionNumber,
          transactionDate: request.transaction.transactionDate.toISOString(),
          amount: request.transaction.amount.toString(),
          direction: request.transaction.direction,
          type: request.transaction.type,
        }
      : null,
  };
}
