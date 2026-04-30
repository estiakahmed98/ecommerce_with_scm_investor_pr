import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSupplierPortalContext } from "@/lib/supplier-portal";
import {
  SUPPLIER_DOCUMENT_TYPES,
  type SupplierDocumentType,
} from "@/lib/supplier-documents";
import { logActivity } from "@/lib/activity-log";
import {
  createSupplierPortalNotifications,
  dispatchSupplierPortalEmailNotifications,
} from "@/lib/supplier-portal-notifications";

type SupplierDocumentInput = {
  type: SupplierDocumentType;
  documentNumber: string | null;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
};

const SUPPLIER_DOCUMENT_TYPE_SET = new Set<string>(SUPPLIER_DOCUMENT_TYPES);

function toCleanText(value: unknown, max = 255): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toOptionalInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Numeric fields must be non-negative integers.");
  }
  return parsed;
}

function toOptionalDate(value: unknown, fieldLabel: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldLabel} is invalid.`);
  }
  return parsed.toISOString();
}

function parseDocumentList(raw: unknown): SupplierDocumentInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("Documents must be an array.");
  }

  const seenTypes = new Set<SupplierDocumentType>();
  return raw.map((entry, index) => {
    const value =
      entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    if (!value) {
      throw new Error(`Document row ${index + 1} is invalid.`);
    }
    if (
      typeof value.type !== "string" ||
      !SUPPLIER_DOCUMENT_TYPE_SET.has(value.type)
    ) {
      throw new Error(`Document row ${index + 1} has an invalid document type.`);
    }
    const type = value.type as SupplierDocumentType;
    if (seenTypes.has(type)) {
      throw new Error(`Document row ${index + 1} is duplicated for ${type}.`);
    }
    seenTypes.add(type);

    const fileUrl = toCleanText(value.fileUrl, 500);
    if (!fileUrl) {
      throw new Error(`Document row ${index + 1} must include file URL.`);
    }

    const fileSize =
      value.fileSize === undefined || value.fileSize === null || value.fileSize === ""
        ? null
        : Number(value.fileSize);
    if (fileSize !== null && (!Number.isInteger(fileSize) || fileSize < 0)) {
      throw new Error(`Document row ${index + 1} has invalid file size.`);
    }

    return {
      type,
      documentNumber: toCleanText(value.documentNumber, 120) || null,
      fileUrl,
      fileName: toCleanText(value.fileName, 255) || null,
      mimeType: toCleanText(value.mimeType, 120) || null,
      fileSize,
      issuedAt: toOptionalDate(value.issuedAt, `${type} issued date`),
      expiresAt: toOptionalDate(value.expiresAt, `${type} expiry date`),
    };
  });
}

type UpdateRequestType = "PROFILE_UPDATE" | "DOCUMENT_UPDATE" | "ANNUAL_RENEWAL";

function normalizeRequestType(value: unknown, hasDocuments: boolean): UpdateRequestType {
  if (value === "PROFILE_UPDATE" || value === "DOCUMENT_UPDATE" || value === "ANNUAL_RENEWAL") {
    return value;
  }
  return hasDocuments ? "DOCUMENT_UPDATE" : "PROFILE_UPDATE";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const canReadProfile =
      resolved.context.access.has("supplier.profile.read") ||
      resolved.context.access.has("supplier.documents.read");
    if (!canReadProfile) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [supplier, portalAccess, recentRequests, unreadCount] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id: resolved.context.supplierId },
        select: {
          id: true,
          code: true,
          name: true,
          companyType: true,
          contactName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          country: true,
          leadTimeDays: true,
          paymentTermsDays: true,
          currency: true,
          taxNumber: true,
          notes: true,
          isActive: true,
          categories: {
            orderBy: { id: "asc" },
            select: {
              supplierCategory: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          documents: {
            orderBy: [{ type: "asc" }, { id: "asc" }],
            select: {
              id: true,
              type: true,
              documentNumber: true,
              fileUrl: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              issuedAt: true,
              expiresAt: true,
              verificationStatus: true,
              verifiedAt: true,
              verificationNote: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.supplierPortalAccess.findUnique({
        where: { userId: resolved.context.userId },
        select: {
          id: true,
          status: true,
          note: true,
          twoFactorRequired: true,
          twoFactorMethod: true,
          twoFactorLastVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.supplierProfileUpdateRequest.findMany({
        where: {
          supplierId: resolved.context.supplierId,
          requestedByUserId: resolved.context.userId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          requestType: true,
          status: true,
          note: true,
          reviewNote: true,
          requestedAt: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.supplierPortalNotification.count({
        where: {
          supplierId: resolved.context.supplierId,
          OR: [{ userId: null }, { userId: resolved.context.userId }],
          readAt: null,
        },
      }),
    ]);

    if (!supplier || !portalAccess) {
      return NextResponse.json(
        { error: "Supplier profile could not be loaded." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      supplier: {
        ...supplier,
        categories: supplier.categories.map((item) => item.supplierCategory),
        documents: supplier.documents.map((document) => ({
          ...document,
          issuedAt: document.issuedAt?.toISOString() ?? null,
          expiresAt: document.expiresAt?.toISOString() ?? null,
          verifiedAt: document.verifiedAt?.toISOString() ?? null,
          createdAt: document.createdAt.toISOString(),
          updatedAt: document.updatedAt.toISOString(),
        })),
      },
      portalAccess: {
        ...portalAccess,
        twoFactorLastVerifiedAt:
          portalAccess.twoFactorLastVerifiedAt?.toISOString() ?? null,
        createdAt: portalAccess.createdAt.toISOString(),
        updatedAt: portalAccess.updatedAt.toISOString(),
      },
      unreadNotificationCount: unreadCount,
      recentRequests: recentRequests.map((item) => ({
        ...item,
        requestedAt: item.requestedAt.toISOString(),
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("SUPPLIER PROFILE GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier profile." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const canSubmitProfile =
      resolved.context.access.has("supplier.profile.update_request.submit") ||
      resolved.context.access.has("supplier.documents.update_request.submit");
    if (!canSubmitProfile) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const profile = {
      contactName: toCleanText(body.contactName, 120) || null,
      email: toCleanText(body.email, 120) || null,
      phone: toCleanText(body.phone, 40) || null,
      address: toCleanText(body.address, 255) || null,
      city: toCleanText(body.city, 80) || null,
      country: toCleanText(body.country, 8) || "BD",
      taxNumber: toCleanText(body.taxNumber, 60) || null,
      notes: toCleanText(body.notes, 500) || null,
      leadTimeDays: toOptionalInteger(body.leadTimeDays),
      paymentTermsDays: toOptionalInteger(body.paymentTermsDays),
      currency: toCleanText(body.currency, 3).toUpperCase() || "BDT",
    };

    const documents = parseDocumentList(body.documents);
    const requestType = normalizeRequestType(body.requestType, documents.length > 0);
    const note = toCleanText(body.note, 500) || null;

    const currentUser = await prisma.user.findUnique({
      where: { id: resolved.context.userId },
      select: { id: true, email: true, name: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const pendingCount = await prisma.supplierProfileUpdateRequest.count({
      where: {
        supplierId: resolved.context.supplierId,
        requestedByUserId: resolved.context.userId,
        status: "PENDING",
      },
    });
    if (pendingCount >= 5) {
      return NextResponse.json(
        { error: "Too many pending requests. Wait for admin review first." },
        { status: 429 },
      );
    }

    const { createdRequest, emailNotificationIds } = await prisma.$transaction(
      async (tx) => {
        const created = await tx.supplierProfileUpdateRequest.create({
          data: {
            supplierId: resolved.context.supplierId,
            requestedByUserId: resolved.context.userId,
            requestType,
            status: "PENDING",
            payload: {
              profile,
              documents,
            },
            note,
          },
          select: {
            id: true,
            requestType: true,
            status: true,
            note: true,
            requestedAt: true,
            createdAt: true,
          },
        });

        const notificationIds = await createSupplierPortalNotifications({
          tx,
          notifications: [
            {
              supplierId: resolved.context.supplierId,
              userId: resolved.context.userId,
              type: "APPROVAL",
              title: "Update Request Submitted",
              message:
                "Your supplier profile update request was submitted and is waiting for admin approval.",
              recipientEmail: currentUser.email,
              metadata: {
                requestId: created.id,
                requestType: created.requestType,
              },
              createdById: resolved.context.userId,
            },
          ],
        });

        return { createdRequest: created, emailNotificationIds: notificationIds };
      },
    );

    await dispatchSupplierPortalEmailNotifications(emailNotificationIds);

    await logActivity({
      action: "submit_profile_update_request",
      entity: "supplier_profile_update_request",
      entityId: createdRequest.id,
      access: resolved.context.access,
      request,
      metadata: {
        message: `Supplier profile update request submitted by ${currentUser.email ?? resolved.context.userId}`,
        supplierId: resolved.context.supplierId,
        requestType: createdRequest.requestType,
      },
      after: {
        supplierId: resolved.context.supplierId,
        requestType: createdRequest.requestType,
        status: createdRequest.status,
        note: createdRequest.note,
      },
    });

    return NextResponse.json(
      {
        id: createdRequest.id,
        requestType: createdRequest.requestType,
        status: createdRequest.status,
        note: createdRequest.note,
        requestedAt: createdRequest.requestedAt.toISOString(),
        createdAt: createdRequest.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("SUPPLIER PROFILE PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to submit supplier update request." },
      { status: 500 },
    );
  }
}
