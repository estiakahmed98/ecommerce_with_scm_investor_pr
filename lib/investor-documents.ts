import type { InvestorDocumentVerificationStatus, InvestorKycStatus } from "@/generated/prisma";

export const INVESTOR_DOCUMENT_TYPES = [
  "IDENTITY_PROOF",
  "TAX_IDENTIFICATION",
  "BANK_PROOF",
  "ADDRESS_PROOF",
  "INVESTMENT_AGREEMENT",
  "SOURCE_OF_FUNDS",
] as const;

export type InvestorDocumentType = (typeof INVESTOR_DOCUMENT_TYPES)[number];

export const INVESTOR_DOCUMENT_LABELS: Record<InvestorDocumentType, string> = {
  IDENTITY_PROOF: "Identity Proof",
  TAX_IDENTIFICATION: "Tax Identification",
  BANK_PROOF: "Bank Proof",
  ADDRESS_PROOF: "Address Proof",
  INVESTMENT_AGREEMENT: "Investment Agreement",
  SOURCE_OF_FUNDS: "Source of Funds",
};

export const INVESTOR_REQUIRED_DOCUMENTS: InvestorDocumentType[] = [
  "IDENTITY_PROOF",
  "TAX_IDENTIFICATION",
  "BANK_PROOF",
  "ADDRESS_PROOF",
  "INVESTMENT_AGREEMENT",
  "SOURCE_OF_FUNDS",
];

const documentTypeSet = new Set<string>(INVESTOR_DOCUMENT_TYPES);

export function isInvestorDocumentType(value: unknown): value is InvestorDocumentType {
  return typeof value === "string" && documentTypeSet.has(value);
}

export function getInvestorDocumentLabel(type: InvestorDocumentType) {
  return INVESTOR_DOCUMENT_LABELS[type];
}

export function getMissingInvestorDocumentTypes(
  documents: Array<{ type: string; fileUrl?: string | null }>,
) {
  const present = new Set<InvestorDocumentType>();

  for (const document of documents) {
    if (
      isInvestorDocumentType(document.type) &&
      typeof document.fileUrl === "string" &&
      document.fileUrl.trim().length > 0
    ) {
      present.add(document.type);
    }
  }

  return INVESTOR_REQUIRED_DOCUMENTS.filter((type) => !present.has(type));
}

export function deriveInvestorKycStatusFromDocuments(
  documents: Array<{
    type: string;
    fileUrl?: string | null;
    status: InvestorDocumentVerificationStatus;
    expiresAt?: Date | string | null;
  }>,
): { kycStatus: InvestorKycStatus; verifiedAt: Date | null } {
  const requiredDocs = INVESTOR_REQUIRED_DOCUMENTS.map((type) =>
    documents.find((document) => document.type === type),
  );

  const hasAnyDocument = documents.length > 0;
  if (!hasAnyDocument) {
    return {
      kycStatus: "PENDING",
      verifiedAt: null,
    };
  }

  const now = Date.now();
  const hasRejected = requiredDocs.some((document) => document?.status === "REJECTED");
  if (hasRejected) {
    return {
      kycStatus: "REJECTED",
      verifiedAt: null,
    };
  }

  const allRequiredPresent = requiredDocs.every((document) => Boolean(document?.fileUrl));
  const allRequiredVerified = requiredDocs.every((document) => {
    if (!document) return false;
    if (document.status !== "VERIFIED") return false;
    if (!document.expiresAt) return true;
    const expiry = new Date(document.expiresAt);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() >= now;
  });

  if (allRequiredPresent && allRequiredVerified) {
    return {
      kycStatus: "VERIFIED",
      verifiedAt: new Date(),
    };
  }

  return {
    kycStatus: "UNDER_REVIEW",
    verifiedAt: null,
  };
}
