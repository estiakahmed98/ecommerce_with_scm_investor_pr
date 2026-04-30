import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  assertRequiredSupplierDocuments,
  hasSupplierManageAccess,
  hasSupplierReadAccess,
  normalizeSupplierCode,
  normalizeSupplierCompanyType,
  parseSupplierCategoryIds,
  parseSupplierDocuments,
  serializeSupplier,
  SupplierValidationError,
  toCleanText,
  toSupplierSnapshot,
} from "../shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supplierId = Number(id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: "Invalid supplier id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasSupplierReadAccess(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        documents: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        categories: {
          orderBy: [{ id: "asc" }],
          include: {
            supplierCategory: {
              select: {
                id: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }

    return NextResponse.json(serializeSupplier(supplier));
  } catch (error) {
    console.error("SCM SUPPLIER GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supplierId = Number(id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: "Invalid supplier id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasSupplierManageAccess(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        documents: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        categories: {
          orderBy: [{ id: "asc" }],
          include: {
            supplierCategory: {
              select: {
                id: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = toCleanText(body.name, 120) || existing.name;
    const code = normalizeSupplierCode(body.code, name) || existing.code;
    const companyType = normalizeSupplierCompanyType(
      body.companyType,
      existing.companyType,
    );

    if (!companyType) {
      return NextResponse.json(
        { error: "Supplier company type is required." },
        { status: 400 },
      );
    }

    const documents =
      body.documents === undefined
        ? existing.documents.map((document) => ({
            type: document.type,
            documentNumber: document.documentNumber,
            fileUrl: document.fileUrl,
            fileName: document.fileName,
            mimeType: document.mimeType,
            fileSize: document.fileSize,
            issuedAt: document.issuedAt,
            expiresAt: document.expiresAt,
            verificationStatus: document.verificationStatus,
            verifiedAt: document.verifiedAt,
            verificationNote: document.verificationNote,
          }))
        : parseSupplierDocuments(body.documents);
    const categoryIds =
      body.categoryIds === undefined
        ? existing.categories.map((membership) => membership.supplierCategory.id)
        : parseSupplierCategoryIds(body.categoryIds);

    assertRequiredSupplierDocuments(companyType, documents);

    const leadTimeDays =
      body.leadTimeDays === null || body.leadTimeDays === undefined || body.leadTimeDays === ""
        ? null
        : Number(body.leadTimeDays);
    const paymentTermsDays =
      body.paymentTermsDays === null ||
      body.paymentTermsDays === undefined ||
      body.paymentTermsDays === ""
        ? null
        : Number(body.paymentTermsDays);

    if (
      (leadTimeDays !== null && (!Number.isInteger(leadTimeDays) || leadTimeDays < 0)) ||
      (paymentTermsDays !== null &&
        (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0))
    ) {
      return NextResponse.json(
        { error: "Lead time and payment terms must be non-negative integers." },
        { status: 400 },
      );
    }

    const categories =
      categoryIds.length > 0
        ? await prisma.supplierCategory.findMany({
            where: {
              id: { in: categoryIds },
              isActive: true,
            },
            select: { id: true },
          })
        : [];
    if (categories.length !== categoryIds.length) {
      return NextResponse.json(
        {
          error:
            "One or more supplier categories were not found or inactive.",
        },
        { status: 400 },
      );
    }

    const updated = await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        code,
        name,
        companyType,
        contactName: toCleanText(body.contactName, 120) || null,
        email: toCleanText(body.email, 120) || null,
        phone: toCleanText(body.phone, 40) || null,
        address: toCleanText(body.address, 255) || null,
        city: toCleanText(body.city, 80) || null,
        country: toCleanText(body.country, 8) || "BD",
        leadTimeDays,
        paymentTermsDays,
        currency: toCleanText(body.currency, 3).toUpperCase() || "BDT",
        taxNumber: toCleanText(body.taxNumber, 60) || null,
        notes: toCleanText(body.notes, 500) || null,
        isActive: body.isActive === undefined ? existing.isActive : Boolean(body.isActive),
        documents: {
          deleteMany: {},
          create: documents,
        },
        categories: {
          deleteMany: {},
          ...(categoryIds.length > 0
            ? {
                create: categoryIds.map((supplierCategoryId) => ({
                  supplierCategoryId,
                  createdById: access.userId,
                })),
              }
            : {}),
        },
      },
      include: {
        documents: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        categories: {
          orderBy: [{ id: "asc" }],
          include: {
            supplierCategory: {
              select: {
                id: true,
                code: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    await logActivity({
      action: "update",
      entity: "supplier",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated supplier ${updated.name} (${updated.code})`,
      },
      before: toSupplierSnapshot(existing),
      after: toSupplierSnapshot(updated),
    });

    return NextResponse.json(serializeSupplier(updated));
  } catch (error: any) {
    console.error("SCM SUPPLIER PATCH ERROR:", error);
    if (error instanceof SupplierValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Supplier code already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error?.message || "Failed to update supplier." },
      { status: 500 },
    );
  }
}
