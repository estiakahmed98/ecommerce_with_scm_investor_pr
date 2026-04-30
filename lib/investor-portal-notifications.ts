import { Prisma } from "@/generated/prisma";

type NotificationClient = Prisma.TransactionClient;

export const INVESTOR_PORTAL_NOTIFICATION_TYPES = [
  "PROFILE_UPDATE_REQUEST",
  "PROFILE_UPDATE_APPROVED",
  "PROFILE_UPDATE_REJECTED",
  "WITHDRAWAL_REQUEST",
  "WITHDRAWAL_STATUS",
  "DOCUMENT_REVIEW",
  "PAYOUT_STATUS",
  "STATEMENT_READY",
  "SYSTEM",
] as const;

export type InvestorPortalNotificationTypeValue =
  (typeof INVESTOR_PORTAL_NOTIFICATION_TYPES)[number];

type InvestorPortalNotificationInput = {
  investorId: number;
  type: InvestorPortalNotificationTypeValue;
  title: string;
  message: string;
  targetUrl?: string | null;
  metadata?: Prisma.InputJsonValue;
  createdById?: string | null;
};

export async function createInvestorPortalNotification(params: {
  tx: NotificationClient;
  notification: InvestorPortalNotificationInput;
}) {
  return params.tx.investorPortalNotification.create({
    data: {
      investorId: params.notification.investorId,
      type: params.notification.type,
      title: params.notification.title,
      message: params.notification.message,
      targetUrl: params.notification.targetUrl ?? null,
      metadata: params.notification.metadata ?? undefined,
      createdById: params.notification.createdById ?? null,
    },
    select: { id: true },
  });
}

export async function createInvestorPortalNotifications(params: {
  tx: NotificationClient;
  notifications: InvestorPortalNotificationInput[];
}) {
  const ids: number[] = [];
  for (const item of params.notifications) {
    const created = await createInvestorPortalNotification({
      tx: params.tx,
      notification: item,
    });
    ids.push(created.id);
  }
  return ids;
}

export function serializeInvestorPortalNotification(notification: {
  id: number;
  type: string;
  title: string;
  message: string;
  status: string;
  targetUrl: string | null;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    status: notification.status,
    targetUrl: notification.targetUrl,
    metadata: notification.metadata,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
