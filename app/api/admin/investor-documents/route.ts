import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  INVESTOR_DOCUMENT_TYPES,
  getInvestorDocumentLabel,
  getMissingInvestorDocumentTypes,
  isInvestorDocumentType,
} from "@/lib/investor-documents";
import {
  getInvestorDocumentReadSummary,
  serializeInvestorDocument,
  syncInvestorKycStatus,
} from "@/lib/investor-document-service";
import { createInvestorPortalNotification } from "@/lib/investor-portal-notifications";

function canReadInvestorDocuments(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("investor_documents.read") ||
    access.hasGlobal("investor_documents.manage") ||
    access.hasGlobal("investor_documents.review") ||
    access.hasGlobal("investors.read") ||
    access.hasGlobal("investors.manage")
  );
}

function canManageInvestorDocuments(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_documents.manage") || access.hasGlobal("investors.manage");
}

function canReviewInvestorDocuments(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_documents.review") || access.hasGlobal("investors.manage");
}

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    if (!canReadInvestorDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const investorId = Number(request.nextUrl.searchParams.get("investorId") || "");

    const investors = await prisma.investor.findMany({
      where: {
        ...(Number.isInteger(investorId) && investorId > 0 ? { id: investorId } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }],
      include: {
        documents: {
          orderBy: [{ type: "asc" }],
          include: {
            uploadedBy: {
              select: { id: true, name: true, email: true },
            },
            reviewedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      take: 300,
    });

    return NextResponse.json({
      requiredDocumentTypes: INVESTOR_DOCUMENT_TYPES,
      investors: investors.map((investor) => ({
        id: investor.id,
        code: investor.code,
        name: investor.name,
        email: investor.email,
        status: investor.status,
        kycStatus: investor.kycStatus,
        kycVerifiedAt: investor.kycVerifiedAt?.toISOString() ?? null,
        documents: investor.documents.map((document) => serializeInvestorDocument(document)),
        missingDocumentTypes: getMissingInvestorDocumentTypes(investor.documents),
      })),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR DOCUMENTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor documents." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageInvestorDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const investorId = Number(body.investorId);
    const type = typeof body.type === "string" ? body.type : "";
    const fileUrl = toCleanText(body.fileUrl, 2000);

    if (!Number.isInteger(investorId) || investorId <= 0) {
      return NextResponse.json({ error: "Valid investor is required." }, { status: 400 });
    }
    if (!isInvestorDocumentType(type)) {
      return NextResponse.json({ error: "Valid document type is required." }, { status: 400 });
    }
    if (!fileUrl.startsWith("/api/upload/investor-kyc/")) {
      return NextResponse.json({ error: "Invalid investor document upload URL." }, { status: 400 });
    }

    const existing = await prisma.investorDocument.findUnique({
      where: {
        investorId_type: {
          investorId,
          type,
        },
      },
      select: {
        id: true,
        status: true,
        fileUrl: true,
      },
    });

    const saved = await prisma.$transaction(async (tx) => {
      const record = await tx.investorDocument.upsert({
        where: {
          investorId_type: {
            investorId,
            type,
          },
        },
        create: {
          investorId,
          type,
          fileUrl,
          fileName: toCleanText(body.fileName, 255) || null,
          mimeType: toCleanText(body.mimeType, 120) || null,
          fileSize:
            body.fileSize === null || body.fileSize === undefined || body.fileSize === ""
              ? null
              : Number(body.fileSize),
          documentNumber: toCleanText(body.documentNumber, 120) || null,
          issuedAt: parseOptionalDate(body.issuedAt),
          expiresAt: parseOptionalDate(body.expiresAt),
          status: "PENDING",
          reviewNote: toCleanText(body.reviewNote, 500) || null,
          uploadedById: access.userId,
          reviewedById: null,
          reviewedAt: null,
        },
        update: {
          fileUrl,
          fileName: toCleanText(body.fileName, 255) || null,
          mimeType: toCleanText(body.mimeType, 120) || null,
          fileSize:
            body.fileSize === null || body.fileSize === undefined || body.fileSize === ""
              ? null
              : Number(body.fileSize),
          documentNumber: toCleanText(body.documentNumber, 120) || null,
          issuedAt: parseOptionalDate(body.issuedAt),
          expiresAt: parseOptionalDate(body.expiresAt),
          status: "PENDING",
          reviewNote: toCleanText(body.reviewNote, 500) || null,
          uploadedById: access.userId,
          reviewedById: null,
          reviewedAt: null,
        },
        include: {
          uploadedBy: {
            select: { id: true, name: true, email: true },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await syncInvestorKycStatus(tx, investorId);
      return record;
    });

    await logActivity({
      action: existing ? "update" : "create",
      entity: "investor_document",
      entityId: String(saved.id),
      access,
      request,
      metadata: {
        message: `${existing ? "Updated" : "Uploaded"} ${getInvestorDocumentLabel(type)} for investor #${investorId}`,
        investorId,
        type,
      },
    });

    const summary = await getInvestorDocumentReadSummary(investorId);

    return NextResponse.json(
      {
        document: serializeInvestorDocument(saved),
        investor: summary.investor,
      },
      { status: existing ? 200 : 201 },
    );
  } catch (error: any) {
    console.error("ADMIN INVESTOR DOCUMENTS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save investor document." },
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
    if (!canReviewInvestorDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const documentId = Number(body.documentId);
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    if (!Number.isInteger(documentId) || documentId <= 0) {
      return NextResponse.json({ error: "Valid document id is required." }, { status: 400 });
    }
    if (!["verify", "reject", "reopen"].includes(action)) {
      return NextResponse.json({ error: "Invalid document review action." }, { status: 400 });
    }

    const existing = await prisma.investorDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        investorId: true,
        type: true,
        status: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Investor document not found." }, { status: 404 });
    }

    const nextStatus =
      action === "verify" ? "VERIFIED" : action === "reject" ? "REJECTED" : "UNDER_REVIEW";
    const reviewNote = toCleanText(body.reviewNote, 500) || null;

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.investorDocument.update({
        where: { id: documentId },
        data: {
          status: nextStatus,
          reviewNote,
          reviewedById: access.userId,
          reviewedAt: new Date(),
        },
        include: {
          uploadedBy: {
            select: { id: true, name: true, email: true },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });
      await syncInvestorKycStatus(tx, existing.investorId);
      await createInvestorPortalNotification({
        tx,
        notification: {
          investorId: existing.investorId,
          type: "DOCUMENT_REVIEW",
          title:
            nextStatus === "VERIFIED"
              ? "Document Verified"
              : nextStatus === "REJECTED"
                ? "Document Rejected"
                : "Document Reopened",
          message: `${getInvestorDocumentLabel(existing.type)} is now ${nextStatus.replace("_", " ").toLowerCase()}.${reviewNote ? ` Note: ${reviewNote}` : ""}`,
          targetUrl: "/investor/documents",
          metadata: {
            documentId: existing.id,
            type: existing.type,
            status: nextStatus,
          },
          createdById: access.userId,
        },
      });
      return record;
    });

    await logActivity({
      action: "update",
      entity: "investor_document",
      entityId: String(updated.id),
      access,
      request,
      metadata: {
        message: `${action} ${getInvestorDocumentLabel(existing.type)} for investor #${existing.investorId}`,
        investorId: existing.investorId,
        type: existing.type,
        status: nextStatus,
      },
    });

    const summary = await getInvestorDocumentReadSummary(existing.investorId);

    return NextResponse.json({
      document: serializeInvestorDocument(updated),
      investor: summary.investor,
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR DOCUMENTS PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to review investor document." },
      { status: 500 },
    );
  }
}
