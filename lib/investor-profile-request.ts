import { toCleanText } from "@/lib/investor";

export function buildInvestorPortalProfileRequestPayload(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  const fields: Array<[string, number]> = [
    ["name", 120],
    ["email", 160],
    ["phone", 40],
    ["legalName", 160],
    ["taxNumber", 120],
    ["nationalIdNumber", 120],
    ["passportNumber", 120],
    ["bankName", 160],
    ["bankAccountName", 160],
    ["bankAccountNumber", 160],
    ["notes", 500],
  ];

  for (const [field, max] of fields) {
    if (body[field] !== undefined) {
      const cleaned = toCleanText(body[field], max);
      payload[field] = cleaned || null;
    }
  }

  return payload;
}

export function serializeInvestorProfileUpdateRequest(request: {
  id: number;
  investorId: number;
  status: string;
  requestedChanges: unknown;
  currentSnapshot: unknown;
  requestNote: string | null;
  reviewNote: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  appliedAt: Date | null;
  submittedBy?: { id: string; name: string | null; email: string } | null;
  reviewedBy?: { id: string; name: string | null; email: string } | null;
}) {
  return {
    id: request.id,
    investorId: request.investorId,
    status: request.status,
    requestedChanges: request.requestedChanges,
    currentSnapshot: request.currentSnapshot,
    requestNote: request.requestNote,
    reviewNote: request.reviewNote,
    submittedAt: request.submittedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    appliedAt: request.appliedAt?.toISOString() ?? null,
    submittedBy: request.submittedBy ?? null,
    reviewedBy: request.reviewedBy ?? null,
  };
}
