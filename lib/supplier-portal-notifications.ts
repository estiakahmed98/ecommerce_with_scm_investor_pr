import nodemailer from "nodemailer";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

type TransactionClient = Prisma.TransactionClient;

type SupplierPortalNotificationInput = {
  supplierId: number;
  userId?: string | null;
  type?:
    | "GENERAL"
    | "DOCUMENT_EXPIRY"
    | "APPROVAL"
    | "RFQ"
    | "WORK_ORDER"
    | "PAYMENT";
  title: string;
  message: string;
  recipientEmail?: string | null;
  metadata?: Prisma.InputJsonValue;
  createdById?: string | null;
};

function createSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function createSupplierPortalNotifications(params: {
  tx: TransactionClient;
  notifications: SupplierPortalNotificationInput[];
}): Promise<number[]> {
  const emailNotificationIds: number[] = [];

  for (const item of params.notifications) {
    await params.tx.supplierPortalNotification.create({
      data: {
        supplierId: item.supplierId,
        userId: item.userId ?? null,
        channel: "SYSTEM",
        status: "SENT",
        type: item.type ?? "GENERAL",
        title: item.title,
        message: item.message,
        recipientEmail: item.recipientEmail ?? null,
        metadata: item.metadata ?? undefined,
        createdById: item.createdById ?? null,
        sentAt: new Date(),
      },
      select: { id: true },
    });

    if (!item.recipientEmail) continue;

    const createdEmail = await params.tx.supplierPortalNotification.create({
      data: {
        supplierId: item.supplierId,
        userId: item.userId ?? null,
        channel: "EMAIL",
        status: "PENDING",
        type: item.type ?? "GENERAL",
        title: item.title,
        message: item.message,
        recipientEmail: item.recipientEmail,
        metadata: item.metadata ?? undefined,
        createdById: item.createdById ?? null,
      },
      select: { id: true },
    });

    emailNotificationIds.push(createdEmail.id);
  }

  return emailNotificationIds;
}

export async function dispatchSupplierPortalEmailNotifications(
  notificationIds: number[],
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (notificationIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const transporter = createSmtpTransporter();
  const smtpFrom =
    process.env.SUPPLIER_PORTAL_ALERT_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER;

  if (!transporter || !smtpFrom) {
    return { sent: 0, failed: 0, skipped: notificationIds.length };
  }

  const rows = await prisma.supplierPortalNotification.findMany({
    where: {
      id: { in: notificationIds },
      channel: "EMAIL",
      status: "PENDING",
      recipientEmail: { not: null },
    },
    select: {
      id: true,
      recipientEmail: true,
      title: true,
      message: true,
      supplier: {
        select: {
          code: true,
          name: true,
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
        subject: row.title,
        text:
          `${row.message}\n\n` +
          `Supplier: ${row.supplier.name} (${row.supplier.code})\n`,
      });

      await prisma.supplierPortalNotification.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date() },
      });

      sent += 1;
    } catch (error: any) {
      failed += 1;
      await prisma.supplierPortalNotification.update({
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
