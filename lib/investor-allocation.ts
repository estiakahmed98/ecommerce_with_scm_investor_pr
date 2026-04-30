import { Prisma } from "@/generated/prisma";
import { toCleanText } from "@/lib/investor";

export const INVESTOR_ALLOCATION_STATUS_VALUES = [
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
] as const;

export type InvestorAllocationStatusValue =
  (typeof INVESTOR_ALLOCATION_STATUS_VALUES)[number];

export function parseInvestorAllocationStatus(value: unknown): InvestorAllocationStatusValue {
  const raw = toCleanText(value, 32).toUpperCase();
  return INVESTOR_ALLOCATION_STATUS_VALUES.includes(raw as InvestorAllocationStatusValue)
    ? (raw as InvestorAllocationStatusValue)
    : "ACTIVE";
}

export function dateRangesOverlap(input: {
  startA: Date;
  endA: Date | null;
  startB: Date;
  endB: Date | null;
}) {
  const endA = input.endA?.getTime() ?? Number.POSITIVE_INFINITY;
  const endB = input.endB?.getTime() ?? Number.POSITIVE_INFINITY;
  return input.startA.getTime() <= endB && input.startB.getTime() <= endA;
}

export function sumParticipationPercent(
  entries: Array<{ participationPercent: Prisma.Decimal | null }>,
) {
  return entries.reduce(
    (total, entry) => total.plus(entry.participationPercent ?? new Prisma.Decimal(0)),
    new Prisma.Decimal(0),
  );
}
