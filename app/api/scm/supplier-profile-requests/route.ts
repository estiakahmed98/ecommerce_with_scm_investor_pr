import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  createSupplierPortalNotifications,
  dispatchSupplierPortalEmailNotifications,
} from "@/lib/supplier-portal-notifications";
import { parseSupplierDocuments, toCleanText } from "../suppliers/shared";

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("supplier.profile_requests.read") ||
    access.hasGlobal("supplier.profile_requests.review")
  );
}

function canReview(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("supplier.profile_requests.review");
}

function toOptionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Lead time and payment terms must be non-negative integers.");
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canRead(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const supplierIdRaw = request.nextUrl.searchParams.get("supplierId");
    const supplierId =
      supplierIdRaw && Number.isInteger(Number(supplierIdRaw))
        ? Number(supplierIdRaw)
        : null;

    const rows = await prisma.supplierProfileUpdateRequest.findMany({
      where: {
        ...(status
          ? {
              status: status as "PENDING" | "APPROVED" | "REJECTED",
            }
          : {}),
        ...(supplierId ? { supplierId } : {}),
        ...(search
          ? {
              OR: [
                { supplier: { name: { contains: search, mode: "insensitive" } } },
                { supplier: { code: { contains: search, mode: "insensitive" } } },
                {
                  requestedBy: {
                    email: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 300,
      select: {
        id: true,
        requestType: true,
        status: true,
        payload: true,
        note: true,
        reviewNote: true,
        requestedAt: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        supplier: {
          select: { id: true, code: true, name: true, email: true },
        },
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        requestedAt: row.requestedAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    console.error("SCM SUPPLIER PROFILE REQUESTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier profile requests." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReview(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      decision?: unknown;
      reviewNote?: unknown;
    };

    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
    }
    const decision = typeof body.decision === "string" ? body.decision.toUpperCase() : "";
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return NextResponse.json(
        { error: "Decision must be APPROVE or REJECT." },
        { status: 400 },
      );
    }
    const reviewNote = toCleanText(body.reviewNote, 500) || null;

    const target = await prisma.supplierProfileUpdateRequest.findUnique({
      where: { id },
      select: {
        id: true,
        supplierId: true,
        requestedByUserId: true,
        requestType: true,
        status: true,
        payload: true,
        note: true,
        supplier: {
          select: { id: true, code: true, name: true, email: true },
        },
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!target) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    if (target.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only pending requests can be reviewed." },
        { status: 400 },
      );
    }

    const payload =
      target.payload && typeof target.payload === "object"
        ? (target.payload as Record<string, unknown>)
        : {};

    const profileRaw =
      payload.profile && typeof payload.profile === "object"
        ? (payload.profile as Record<string, unknown>)
        : {};
    const documents = parseSupplierDocuments(payload.documents);

    const { updatedRequest, emailNotificationIds } = await prisma.$transaction(
      async (tx) => {
        if (decision === "APPROVE") {
          await tx.supplier.update({
            where: { id: target.supplierId },
            data: {
              contactName: toCleanText(profileRaw.contactName, 120) || null,
              email: toCleanText(profileRaw.email, 120) || null,
              phone: toCleanText(profileRaw.phone, 40) || null,
              address: toCleanText(profileRaw.address, 255) || null,
              city: toCleanText(profileRaw.city, 80) || null,
              country: toCleanText(profileRaw.country, 8) || "BD",
              taxNumber: toCleanText(profileRaw.taxNumber, 60) || null,
              notes: toCleanText(profileRaw.notes, 500) || null,
              leadTimeDays: toOptionalInt(profileRaw.leadTimeDays),
              paymentTermsDays: toOptionalInt(profileRaw.paymentTermsDays),
              currency: toCleanText(profileRaw.currency, 3).toUpperCase() || "BDT",
              ...(documents.length > 0
                ? {
                    documents: {
                      deleteMany: {},
                      create: documents.map((item) => ({
                        ...item,
                        verificationStatus: "PENDING",
                        verifiedAt: null,
                        verifiedById: null,
                      })),
                    },
                  }
                : {}),
            },
          });
        }

        const updated = await tx.supplierProfileUpdateRequest.update({
          where: { id: target.id },
          data: {
            status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
            reviewNote,
            reviewedAt: new Date(),
            reviewedById: access.userId,
          },
          select: {
            id: true,
            requestType: true,
            status: true,
            reviewNote: true,
            reviewedAt: true,
          },
        });

        const notificationIds = await createSupplierPortalNotifications({
          tx,
          notifications: [
            {
              supplierId: target.supplierId,
              userId: target.requestedByUserId,
              type: "APPROVAL",
              title:
                decision === "APPROVE"
                  ? "Supplier Update Request Approved"
                  : "Supplier Update Request Rejected",
              message:
                decision === "APPROVE"
                  ? `Your ${target.requestType} request was approved and applied to supplier profile.`
                  : `Your ${target.requestType} request was rejected. Review note: ${reviewNote || "N/A"}`,
              recipientEmail: target.requestedBy.email,
              metadata: {
                requestId: target.id,
                requestType: target.requestType,
                reviewNote,
              },
              createdById: access.userId,
            },
          ],
        });

        return { updatedRequest: updated, emailNotificationIds: notificationIds };
      },
    );

    await dispatchSupplierPortalEmailNotifications(emailNotificationIds);

    await logActivity({
      action: decision === "APPROVE" ? "approve_supplier_profile_request" : "reject_supplier_profile_request",
      entity: "supplier_profile_update_request",
      entityId: target.id,
      access,
      request,
      metadata: {
        message: `${decision === "APPROVE" ? "Approved" : "Rejected"} supplier profile request #${target.id}`,
        supplierId: target.supplierId,
        supplierCode: target.supplier.code,
        supplierName: target.supplier.name,
      },
      before: {
        status: target.status,
        note: target.note,
        requestType: target.requestType,
      },
      after: {
        status: updatedRequest.status,
        reviewNote: updatedRequest.reviewNote,
        reviewedAt: updatedRequest.reviewedAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json({
      id: updatedRequest.id,
      requestType: updatedRequest.requestType,
      status: updatedRequest.status,
      reviewNote: updatedRequest.reviewNote,
      reviewedAt: updatedRequest.reviewedAt?.toISOString() ?? null,
    });
  } catch (error: any) {
    console.error("SCM SUPPLIER PROFILE REQUESTS PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to review supplier profile request." },
      { status: 500 },
    );
  }
}
