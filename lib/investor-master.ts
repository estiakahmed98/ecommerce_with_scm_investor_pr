import type { InvestorStatus } from "@/generated/prisma";
import { parseInvestorStatus, toCleanText } from "@/lib/investor";

export const INVESTOR_SENSITIVE_MASTER_FIELDS = [
  "legalName",
  "taxNumber",
  "nationalIdNumber",
  "passportNumber",
  "bankName",
  "bankAccountName",
  "bankAccountNumber",
  "status",
  "kycReference",
] as const;

export const INVESTOR_DIRECT_MASTER_FIELDS = [
  "name",
  "email",
  "phone",
  "notes",
] as const;

export type InvestorSensitiveMasterField =
  (typeof INVESTOR_SENSITIVE_MASTER_FIELDS)[number];

export type InvestorDirectMasterField = (typeof INVESTOR_DIRECT_MASTER_FIELDS)[number];

export type InvestorSensitiveChangePayload = {
  legalName?: string | null;
  taxNumber?: string | null;
  nationalIdNumber?: string | null;
  passportNumber?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  status?: InvestorStatus;
  kycReference?: string | null;
};

export type InvestorDirectChangePayload = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

function normalizeNullableText(value: unknown, max: number) {
  if (value === undefined) return undefined;
  const cleaned = toCleanText(value, max);
  return cleaned || null;
}

export function buildInvestorSensitiveChangePayload(
  body: Record<string, unknown>,
): InvestorSensitiveChangePayload {
  const payload: InvestorSensitiveChangePayload = {};

  if (body.legalName !== undefined) payload.legalName = normalizeNullableText(body.legalName, 160);
  if (body.taxNumber !== undefined) payload.taxNumber = normalizeNullableText(body.taxNumber, 120);
  if (body.nationalIdNumber !== undefined) payload.nationalIdNumber = normalizeNullableText(body.nationalIdNumber, 120);
  if (body.passportNumber !== undefined) payload.passportNumber = normalizeNullableText(body.passportNumber, 120);
  if (body.bankName !== undefined) payload.bankName = normalizeNullableText(body.bankName, 160);
  if (body.bankAccountName !== undefined) payload.bankAccountName = normalizeNullableText(body.bankAccountName, 160);
  if (body.bankAccountNumber !== undefined) payload.bankAccountNumber = normalizeNullableText(body.bankAccountNumber, 160);
  if (body.status !== undefined) payload.status = parseInvestorStatus(body.status);
  if (body.kycReference !== undefined) payload.kycReference = normalizeNullableText(body.kycReference, 120);

  return payload;
}

export function buildInvestorDirectChangePayload(
  body: Record<string, unknown>,
): InvestorDirectChangePayload {
  const payload: InvestorDirectChangePayload = {};

  if (body.name !== undefined) {
    const name = toCleanText(body.name, 120);
    payload.name = name;
  }
  if (body.email !== undefined) payload.email = normalizeNullableText(body.email, 160);
  if (body.phone !== undefined) payload.phone = normalizeNullableText(body.phone, 40);
  if (body.notes !== undefined) payload.notes = normalizeNullableText(body.notes, 500);

  return payload;
}

export function hasMeaningfulInvestorChanges(
  payload: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  return Object.entries(payload).some(([key, next]) => {
    if (next === undefined) return false;
    return JSON.stringify(current[key] ?? null) !== JSON.stringify(next ?? null);
  });
}

export function sanitizeInvestorMasterSnapshot(investor: {
  code: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  nationalIdNumber: string | null;
  passportNumber: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  status: string;
  kycStatus: string;
  kycReference: string | null;
  notes: string | null;
}) {
  return {
    code: investor.code,
    name: investor.name,
    legalName: investor.legalName,
    email: investor.email,
    phone: investor.phone,
    taxNumber: investor.taxNumber,
    nationalIdNumber: investor.nationalIdNumber,
    passportNumber: investor.passportNumber,
    bankName: investor.bankName,
    bankAccountName: investor.bankAccountName,
    bankAccountNumber: investor.bankAccountNumber,
    status: investor.status,
    kycStatus: investor.kycStatus,
    kycReference: investor.kycReference,
    notes: investor.notes,
  };
}

export function serializeInvestorMasterChangeRequest(request: {
  id: number;
  investorId: number;
  status: string;
  requestedChanges: unknown;
  currentSnapshot: unknown;
  changeSummary: string | null;
  reviewNote: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  appliedAt: Date | null;
  requestedBy?: { id: string; name: string | null; email: string } | null;
  reviewedBy?: { id: string; name: string | null; email: string } | null;
}) {
  return {
    id: request.id,
    investorId: request.investorId,
    status: request.status,
    requestedChanges: request.requestedChanges,
    currentSnapshot: request.currentSnapshot,
    changeSummary: request.changeSummary,
    reviewNote: request.reviewNote,
    requestedAt: request.requestedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    appliedAt: request.appliedAt?.toISOString() ?? null,
    requestedBy: request.requestedBy ?? null,
    reviewedBy: request.reviewedBy ?? null,
  };
}
