import { Prisma } from "@/generated/prisma";

type NotificationClient = Prisma.TransactionClient;

export const INVESTOR_INTERNAL_NOTIFICATION_TYPES = [
  "PROFILE_REQUEST",
  "DOCUMENT_REVIEW",
  "PROFIT_RUN",
  "PAYOUT",
  "WITHDRAWAL",
  "STATEMENT_SCHEDULE",
  "SYSTEM",
] as const;

export type InvestorInternalNotificationTypeValue =
  (typeof INVESTOR_INTERNAL_NOTIFICATION_TYPES)[number];

type InvestorInternalNotificationInput = {
  userId: string;
  type: InvestorInternalNotificationTypeValue;
  title: string;
  message: string;
  targetUrl?: string | null;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  createdById?: string | null;
};

type CreateForPermissionInput = {
  tx: NotificationClient;
  permissionKeys: string[];
  notification: Omit<InvestorInternalNotificationInput, "userId">;
  excludeUserIds?: string[];
};

export async function createInvestorInternalNotification(params: {
  tx: NotificationClient;
  notification: InvestorInternalNotificationInput;
}) {
  return params.tx.investorInternalNotification.create({
    data: {
      userId: params.notification.userId,
      type: params.notification.type,
      title: params.notification.title,
      message: params.notification.message,
      targetUrl: params.notification.targetUrl ?? null,
      entity: params.notification.entity ?? null,
      entityId: params.notification.entityId ?? null,
      metadata: params.notification.metadata ?? undefined,
      createdById: params.notification.createdById ?? null,
    },
    select: { id: true },
  });
}

export async function createInvestorInternalNotifications(params: {
  tx: NotificationClient;
  notifications: InvestorInternalNotificationInput[];
}) {
  const ids: number[] = [];
  for (const item of params.notifications) {
    const created = await createInvestorInternalNotification({
      tx: params.tx,
      notification: item,
    });
    ids.push(created.id);
  }
  return ids;
}

export async function resolveInvestorInternalNotificationRecipientUserIds(
  tx: NotificationClient,
  permissionKeys: string[],
) {
  if (permissionKeys.length === 0) return [];

  const rows = await tx.userRole.findMany({
    where: {
      scopeType: "GLOBAL",
      role: {
        deletedAt: null,
        rolePermissions: {
          some: {
            permission: {
              key: {
                in: permissionKeys,
              },
            },
          },
        },
      },
    },
    select: {
      userId: true,
    },
    distinct: ["userId"],
  });

  return rows.map((row) => row.userId);
}

export async function createInvestorInternalNotificationsForPermissions({
  tx,
  permissionKeys,
  notification,
  excludeUserIds = [],
}: CreateForPermissionInput) {
  const recipients = await resolveInvestorInternalNotificationRecipientUserIds(
    tx,
    permissionKeys,
  );

  const dedupedRecipients = [...new Set(recipients)].filter(
    (userId) => !excludeUserIds.includes(userId),
  );

  if (dedupedRecipients.length === 0) return [];

  return createInvestorInternalNotifications({
    tx,
    notifications: dedupedRecipients.map((userId) => ({
      ...notification,
      userId,
    })),
  });
}

export function serializeInvestorInternalNotification(notification: {
  id: number;
  type: string;
  title: string;
  message: string;
  status: string;
  targetUrl: string | null;
  entity: string | null;
  entityId: string | null;
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
    entity: notification.entity,
    entityId: notification.entityId,
    metadata: notification.metadata,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
