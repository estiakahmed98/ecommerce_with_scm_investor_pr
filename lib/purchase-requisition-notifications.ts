import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

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

export async function dispatchPurchaseRequisitionEmailNotifications(
  notificationIds: number[],
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (notificationIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const transporter = createSmtpTransporter();
  const smtpFrom =
    process.env.MRF_WORKFLOW_ALERT_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER;

  if (!transporter || !smtpFrom) {
    return { sent: 0, failed: 0, skipped: notificationIds.length };
  }

  const rows = await prisma.purchaseRequisitionNotification.findMany({
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
      purchaseRequisition: {
        select: {
          requisitionNumber: true,
          title: true,
          warehouse: {
            select: {
              name: true,
              code: true,
            },
          },
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
        subject: `MRF Workflow: ${row.purchaseRequisition.requisitionNumber}`,
        text:
          `${row.message}\n\n` +
          `MRF: ${row.purchaseRequisition.requisitionNumber}\n` +
          `Title: ${row.purchaseRequisition.title}\n` +
          `Warehouse: ${row.purchaseRequisition.warehouse.name} (${row.purchaseRequisition.warehouse.code})\n`,
      });

      await prisma.purchaseRequisitionNotification.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });
      sent += 1;
    } catch (error: any) {
      failed += 1;
      await prisma.purchaseRequisitionNotification.update({
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
