import { Prisma } from "@/generated/prisma";

type TransactionClient = Prisma.TransactionClient;

export const INVESTOR_STATUS_VALUES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;
export const INVESTOR_KYC_STATUS_VALUES = [
  "PENDING",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
] as const;
export const INVESTOR_TRANSACTION_TYPE_VALUES = [
  "CAPITAL_COMMITMENT",
  "CAPITAL_CONTRIBUTION",
  "PROFIT_ALLOCATION",
  "LOSS_ALLOCATION",
  "DISTRIBUTION",
  "WITHDRAWAL",
  "ADJUSTMENT",
] as const;
export const INVESTOR_LEDGER_DIRECTION_VALUES = ["DEBIT", "CREDIT"] as const;
export const INVESTOR_PROFIT_ALLOCATION_BASIS_VALUES = [
  "NET_REVENUE",
  "NET_UNITS",
] as const;
export const INVESTOR_PROFIT_RUN_STATUS_VALUES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "POSTED",
] as const;
export const INVESTOR_PROFIT_PAYOUT_STATUS_VALUES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "PAID",
  "VOID",
] as const;
export const INVESTOR_PAYOUT_PAYMENT_METHOD_VALUES = [
  "BANK_TRANSFER",
  "MOBILE_BANKING",
  "CHEQUE",
  "CASH",
] as const;

export type InvestorStatusValue = (typeof INVESTOR_STATUS_VALUES)[number];
export type InvestorKycStatusValue = (typeof INVESTOR_KYC_STATUS_VALUES)[number];
export type InvestorTransactionTypeValue =
  (typeof INVESTOR_TRANSACTION_TYPE_VALUES)[number];
export type InvestorLedgerDirectionValue =
  (typeof INVESTOR_LEDGER_DIRECTION_VALUES)[number];
export type InvestorProfitAllocationBasisValue =
  (typeof INVESTOR_PROFIT_ALLOCATION_BASIS_VALUES)[number];
export type InvestorProfitRunStatusValue =
  (typeof INVESTOR_PROFIT_RUN_STATUS_VALUES)[number];
export type InvestorProfitPayoutStatusValue =
  (typeof INVESTOR_PROFIT_PAYOUT_STATUS_VALUES)[number];
export type InvestorPayoutPaymentMethodValue =
  (typeof INVESTOR_PAYOUT_PAYMENT_METHOD_VALUES)[number];

export function toCleanText(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function toDecimalAmount(value: unknown, field: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${field} must be a non-negative number.`);
  }
  return new Prisma.Decimal(amount);
}

export function normalizeInvestorCode(value: unknown) {
  const raw = toCleanText(value, 32).toUpperCase();
  return raw.replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function parseInvestorStatus(value: unknown): InvestorStatusValue {
  const raw = toCleanText(value, 32).toUpperCase();
  return INVESTOR_STATUS_VALUES.includes(raw as InvestorStatusValue)
    ? (raw as InvestorStatusValue)
    : "ACTIVE";
}

export function parseInvestorKycStatus(value: unknown): InvestorKycStatusValue {
  const raw = toCleanText(value, 32).toUpperCase();
  return INVESTOR_KYC_STATUS_VALUES.includes(raw as InvestorKycStatusValue)
    ? (raw as InvestorKycStatusValue)
    : "PENDING";
}

export function parseInvestorTransactionType(value: unknown): InvestorTransactionTypeValue {
  const raw = toCleanText(value, 64).toUpperCase();
  if (INVESTOR_TRANSACTION_TYPE_VALUES.includes(raw as InvestorTransactionTypeValue)) {
    return raw as InvestorTransactionTypeValue;
  }
  throw new Error("Invalid investor transaction type.");
}

export function parseInvestorLedgerDirection(value: unknown): InvestorLedgerDirectionValue {
  const raw = toCleanText(value, 32).toUpperCase();
  if (INVESTOR_LEDGER_DIRECTION_VALUES.includes(raw as InvestorLedgerDirectionValue)) {
    return raw as InvestorLedgerDirectionValue;
  }
  throw new Error("Invalid investor ledger direction.");
}

export function parseInvestorProfitAllocationBasis(
  value: unknown,
): InvestorProfitAllocationBasisValue {
  const raw = toCleanText(value, 32).toUpperCase();
  return INVESTOR_PROFIT_ALLOCATION_BASIS_VALUES.includes(
    raw as InvestorProfitAllocationBasisValue,
  )
    ? (raw as InvestorProfitAllocationBasisValue)
    : "NET_REVENUE";
}

export function parseInvestorPayoutPaymentMethod(
  value: unknown,
): InvestorPayoutPaymentMethodValue {
  const raw = toCleanText(value, 32).toUpperCase();
  if (INVESTOR_PAYOUT_PAYMENT_METHOD_VALUES.includes(raw as InvestorPayoutPaymentMethodValue)) {
    return raw as InvestorPayoutPaymentMethodValue;
  }
  throw new Error("Invalid investor payout payment method.");
}

const INVESTOR_TYPE_DIRECTION_MAP: Record<
  Exclude<InvestorTransactionTypeValue, "ADJUSTMENT">,
  InvestorLedgerDirectionValue
> = {
  CAPITAL_COMMITMENT: "CREDIT",
  CAPITAL_CONTRIBUTION: "CREDIT",
  PROFIT_ALLOCATION: "CREDIT",
  LOSS_ALLOCATION: "DEBIT",
  DISTRIBUTION: "DEBIT",
  WITHDRAWAL: "DEBIT",
};

export function resolveTransactionDirection(input: {
  type: InvestorTransactionTypeValue;
  requestedDirection?: unknown;
}) {
  if (input.type === "ADJUSTMENT") {
    return parseInvestorLedgerDirection(input.requestedDirection);
  }
  return INVESTOR_TYPE_DIRECTION_MAP[input.type];
}

export async function generateInvestorCode(tx: TransactionClient) {
  const lastInvestor = await tx.investor.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return `INV-${String((lastInvestor?.id ?? 0) + 1).padStart(4, "0")}`;
}

export async function generateInvestorTransactionNumber(
  tx: TransactionClient,
  date = new Date(),
) {
  const prefix = `IVT-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const count = await tx.investorCapitalTransaction.count({
    where: {
      transactionNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function generateInvestorProfitRunNumber(tx: TransactionClient, date = new Date()) {
  const prefix = `IPR-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const count = await tx.investorProfitRun.count({
    where: {
      runNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function generateInvestorProfitPayoutNumber(
  tx: TransactionClient,
  date = new Date(),
) {
  const prefix = `IPP-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const count = await tx.investorProfitPayout.count({
    where: {
      payoutNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export function computeInvestorLedgerTotals(
  entries: Array<{ direction: InvestorLedgerDirectionValue; amount: Prisma.Decimal }>,
) {
  const totals = entries.reduce(
    (accumulator, entry) => {
      if (entry.direction === "CREDIT") {
        accumulator.credit = accumulator.credit.plus(entry.amount);
      } else {
        accumulator.debit = accumulator.debit.plus(entry.amount);
      }
      return accumulator;
    },
    {
      debit: new Prisma.Decimal(0),
      credit: new Prisma.Decimal(0),
    },
  );

  return {
    debit: totals.debit,
    credit: totals.credit,
    balance: totals.credit.minus(totals.debit),
  };
}

export function toInvestorSnapshot(investor: {
  code: string;
  name: string;
  legalName?: string | null;
  status: string;
  kycStatus: string;
  email: string | null;
  phone: string | null;
  taxNumber?: string | null;
  nationalIdNumber?: string | null;
  passportNumber?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  beneficiaryVerifiedAt?: Date | string | null;
  beneficiaryVerificationNote?: string | null;
  kycReference?: string | null;
  notes?: string | null;
}) {
  return {
    code: investor.code,
    name: investor.name,
    legalName: investor.legalName ?? null,
    status: investor.status,
    kycStatus: investor.kycStatus,
    email: investor.email,
    phone: investor.phone,
    taxNumber: investor.taxNumber ?? null,
    nationalIdNumber: investor.nationalIdNumber ?? null,
    passportNumber: investor.passportNumber ?? null,
    bankName: investor.bankName ?? null,
    bankAccountName: investor.bankAccountName ?? null,
    bankAccountNumber: investor.bankAccountNumber ?? null,
    beneficiaryVerifiedAt:
      investor.beneficiaryVerifiedAt instanceof Date
        ? investor.beneficiaryVerifiedAt.toISOString()
        : (investor.beneficiaryVerifiedAt ?? null),
    beneficiaryVerificationNote: investor.beneficiaryVerificationNote ?? null,
    kycReference: investor.kycReference ?? null,
    notes: investor.notes ?? null,
  };
}

export function toInvestorTransactionSnapshot(transaction: {
  transactionNumber: string;
  investorId: number;
  type: string;
  direction: string;
  amount: Prisma.Decimal;
  currency: string;
  transactionDate: Date;
  referenceType: string | null;
  referenceNumber: string | null;
  productVariantId: number | null;
}) {
  return {
    transactionNumber: transaction.transactionNumber,
    investorId: transaction.investorId,
    type: transaction.type,
    direction: transaction.direction,
    amount: transaction.amount.toString(),
    currency: transaction.currency,
    transactionDate: transaction.transactionDate.toISOString(),
    referenceType: transaction.referenceType,
    referenceNumber: transaction.referenceNumber,
    productVariantId: transaction.productVariantId,
  };
}
