import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createSupplierPortalNotifications,
  dispatchSupplierPortalEmailNotifications,
} from "@/lib/supplier-portal-notifications";
import { getSupplierDocumentLabel, isSupplierDocumentType } from "@/lib/supplier-documents";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const custom = request.headers.get("x-cron-secret");

  return bearer === secret || custom === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const now = new Date();
    const daysRaw = Number(request.nextUrl.searchParams.get("days") || "30");
    const throttleHoursRaw = Number(request.nextUrl.searchParams.get("throttleHours") || "24");
    const days = Number.isInteger(daysRaw) && daysRaw >= 1 ? daysRaw : 30;
    const throttleHours =
      Number.isInteger(throttleHoursRaw) && throttleHoursRaw >= 1 ? throttleHoursRaw : 24;

    const threshold = new Date(now);
    threshold.setDate(now.getDate() + days);

    const throttleCutoff = new Date(now.getTime() - throttleHours * 60 * 60 * 1000);

    const expiringDocuments = await prisma.supplierDocument.findMany({
      where: {
        expiresAt: { lte: threshold },
        supplier: { isActive: true },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: throttleCutoff } }],
      },
      select: {
        id: true,
        type: true,
        expiresAt: true,
        verificationStatus: true,
        supplierId: true,
        supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            email: true,
            portalAccesses: {
              where: { status: "ACTIVE" },
              select: {
                userId: true,
                user: {
                  select: { email: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 1000,
    });

    let processed = 0;
    let notificationsCreated = 0;
    const emailNotificationIds: number[] = [];

    for (const document of expiringDocuments) {
      const expiresAt = document.expiresAt;
      if (!expiresAt) continue;

      const expired = expiresAt < now;
      const label = isSupplierDocumentType(document.type)
        ? getSupplierDocumentLabel(document.type)
        : document.type;
      const expiresOn = expiresAt.toISOString().slice(0, 10);
      const title = expired
        ? `Compliance Document Expired: ${label}`
        : `Compliance Document Expiring Soon: ${label}`;
      const message = expired
        ? `${label} expired on ${expiresOn}. Upload updated document to avoid RFQ/PO disruption.`
        : `${label} will expire on ${expiresOn}. Upload renewed document before expiry.`;

      const recipients =
        document.supplier.portalAccesses.length > 0
          ? document.supplier.portalAccesses.map((access) => ({
              supplierId: document.supplierId,
              userId: access.userId,
              type: "DOCUMENT_EXPIRY" as const,
              title,
              message,
              recipientEmail: access.user.email,
              metadata: {
                supplierDocumentId: document.id,
                documentType: document.type,
                expiresAt: expiresAt.toISOString(),
                expired,
              },
              createdById: null,
            }))
          : [
              {
                supplierId: document.supplierId,
                userId: null,
                type: "DOCUMENT_EXPIRY" as const,
                title,
                message,
                recipientEmail: document.supplier.email,
                metadata: {
                  supplierDocumentId: document.id,
                  documentType: document.type,
                  expiresAt: expiresAt.toISOString(),
                  expired,
                },
                createdById: null,
              },
            ];

      const createdEmailIds = await prisma.$transaction(async (tx) => {
        await tx.supplierDocument.update({
          where: { id: document.id },
          data: {
            lastReminderAt: now,
            ...(expired && document.verificationStatus !== "EXPIRED"
              ? { verificationStatus: "EXPIRED" }
              : {}),
          },
        });

        return createSupplierPortalNotifications({
          tx,
          notifications: recipients,
        });
      });

      processed += 1;
      notificationsCreated += recipients.length;
      emailNotificationIds.push(...createdEmailIds);
    }

    const emailDispatch = await dispatchSupplierPortalEmailNotifications(
      emailNotificationIds,
    );

    return NextResponse.json({
      ok: true,
      days,
      throttleHours,
      scanned: expiringDocuments.length,
      processed,
      notificationsCreated,
      emailDispatch,
    });
  } catch (error: any) {
    console.error("SCM SUPPLIER DOCUMENT ALERT CRON ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to run supplier document alert cron." },
      { status: 500 },
    );
  }
}
