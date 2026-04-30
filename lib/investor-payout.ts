import { toCleanText } from "@/lib/investor";

export function hasVerifiedInvestorBeneficiary(investor: {
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  beneficiaryVerifiedAt: Date | null;
}) {
  return Boolean(
    investor.bankName &&
      investor.bankAccountName &&
      investor.bankAccountNumber &&
      investor.beneficiaryVerifiedAt,
  );
}

export function toPayoutSnapshotFromInvestor(investor: {
  name: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  beneficiaryVerifiedAt: Date | null;
  beneficiaryVerificationNote: string | null;
}) {
  return {
    beneficiaryNameSnapshot: investor.bankAccountName || investor.name,
    beneficiaryBankNameSnapshot: investor.bankName,
    beneficiaryAccountNumberSnapshot: investor.bankAccountNumber,
    beneficiaryVerifiedAt: investor.beneficiaryVerifiedAt,
    beneficiaryVerificationNote: investor.beneficiaryVerificationNote,
  };
}

export function parsePayoutProofUrl(value: unknown) {
  const cleaned = toCleanText(value, 2000);
  if (!cleaned) return null;
  if (!cleaned.startsWith("/api/upload/investor-payout-proof/")) {
    throw new Error("Invalid payout proof upload URL.");
  }
  return cleaned;
}

export function payoutIsOnHold(payout: {
  heldAt: Date | null;
  releasedAt: Date | null;
}) {
  return Boolean(payout.heldAt && !payout.releasedAt);
}
