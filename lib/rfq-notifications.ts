import nodemailer from "nodemailer";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

type TransactionClient = Prisma.TransactionClient;

type RfqNotificationRecipient = {
  supplierId: number;
  inviteId?: number | null;
  recipientEmail?: string | null;
};

type CreateRfqNotificationsInput = {
  tx: TransactionClient;
  rfqId: number;
  recipients: RfqNotificationRecipient[];
  message: string;
  metadata?: Prisma.InputJsonValue;
  createdById?: string | null;
};

function createSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function createRfqNotifications({
  tx,
  rfqId,
  recipients,
  message,
  metadata,
  createdById = null,
}: CreateRfqNotificationsInput): Promise<number[]> {
  const emailNotificationIds: number[] = [];

  for (const recipient of recipients) {
    await tx.rfqNotification.create({
      data: {
        rfqId,
        supplierId: recipient.supplierId,
        inviteId: recipient.inviteId ?? null,
        channel: "SYSTEM",
        status: "SENT",
        recipientEmail: recipient.recipientEmail ?? null,
        message,
        metadata: metadata ?? undefined,
        createdById,
        sentAt: new Date(),
      },
      select: { id: true },
    });

    if (!recipient.recipientEmail) {
      continue;
    }

    const createdEmail = await tx.rfqNotification.create({
      data: {
        rfqId,
        supplierId: recipient.supplierId,
        inviteId: recipient.inviteId ?? null,
        channel: "EMAIL",
        status: "PENDING",
        recipientEmail: recipient.recipientEmail,
        message,
        metadata: metadata ?? undefined,
        createdById,
      },
      select: { id: true },
    });

    emailNotificationIds.push(createdEmail.id);
  }

  return emailNotificationIds;
}

export async function dispatchRfqEmailNotifications(
  notificationIds: number[],
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (notificationIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const transporter = createSmtpTransporter();
  const smtpFrom =
    process.env.RFQ_ALERT_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!transporter || !smtpFrom) {
    return { sent: 0, failed: 0, skipped: notificationIds.length };
  }

  const rows = await prisma.rfqNotification.findMany({
    where: {
      id: { in: notificationIds },
      channel: "EMAIL",
      status: "PENDING",
      recipientEmail: { not: null },
    },
    select: {
      id: true,
      recipientEmail: true,
      message: true,
      rfq: {
        select: {
          rfqNumber: true,
        },
      },
      supplier: {
        select: {
          name: true,
          code: true,
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: row.recipientEmail!,
        subject: `RFQ Notification: ${row.rfq.rfqNumber}`,
        text:
          `${row.message}\n\n` +
          `RFQ: ${row.rfq.rfqNumber}\n` +
          `Supplier: ${row.supplier.name} (${row.supplier.code})\n`,
      });

      await prisma.rfqNotification.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });
      sent += 1;
    } catch (error: any) {
      failed += 1;
      await prisma.rfqNotification.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          metadata: {
            error: String(error?.message || "Email dispatch failed"),
          },
        },
      });
    }
  }

  return {
    sent,
    failed,
    skipped: notificationIds.length - rows.length,
  };
}

