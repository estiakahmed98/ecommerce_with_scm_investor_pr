import type {
  InvestorStatementDeliveryFormat,
  InvestorStatementScheduleFrequency,
  InvestorStatementScheduleStatus,
} from "@/generated/prisma";

export function addScheduleFrequency(date: Date, frequency: InvestorStatementScheduleFrequency) {
  const next = new Date(date);
  if (frequency === "WEEKLY") {
    next.setDate(next.getDate() + 7);
    return next;
  }
  if (frequency === "MONTHLY") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  next.setMonth(next.getMonth() + 3);
  return next;
}

export function buildInitialInvestorStatementNextRunAt(input?: string | null) {
  if (!input) {
    const fallback = new Date();
    fallback.setHours(9, 0, 0, 0);
    return fallback;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date();
    fallback.setHours(9, 0, 0, 0);
    return fallback;
  }
  return parsed;
}

export function serializeInvestorStatementSchedule(schedule: {
  id: number;
  investorId: number;
  frequency: InvestorStatementScheduleFrequency;
  deliveryFormat: InvestorStatementDeliveryFormat;
  statementWindowDays: number;
  status: InvestorStatementScheduleStatus;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastDispatchedAt: Date | null;
  lastDispatchNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  investor?: {
    id: number;
    code: string;
    name: string;
    status: string;
    portalAccesses?: Array<{ status: string }>;
  } | null;
}) {
  return {
    id: schedule.id,
    investorId: schedule.investorId,
    frequency: schedule.frequency,
    deliveryFormat: schedule.deliveryFormat,
    statementWindowDays: schedule.statementWindowDays,
    status: schedule.status,
    nextRunAt: schedule.nextRunAt.toISOString(),
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    lastDispatchedAt: schedule.lastDispatchedAt?.toISOString() ?? null,
    lastDispatchNote: schedule.lastDispatchNote ?? null,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
    investor: schedule.investor
      ? {
          ...schedule.investor,
          hasActivePortalAccess: Boolean(
            schedule.investor.portalAccesses?.some((item) => item.status === "ACTIVE"),
          ),
        }
      : null,
  };
}

export function getScheduleWindowRange(nextRunAt: Date, windowDays: number) {
  const to = new Date(nextRunAt);
  const from = new Date(nextRunAt);
  from.setDate(from.getDate() - Math.max(windowDays - 1, 0));
  return { from, to };
}

export function isInvestorStatementScheduleOverdue(nextRunAt: Date, now = new Date()) {
  return nextRunAt.getTime() < now.getTime() - 24 * 60 * 60 * 1000;
}
