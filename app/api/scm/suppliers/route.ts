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
} from "./shared";

export async function GET(request: NextRequest) {
  try {
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

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const activeParam = request.nextUrl.searchParams.get("active");
    const isActive =
      activeParam === "true" ? true : activeParam === "false" ? false : undefined;

    const suppliers = await prisma.supplier.findMany({
      where: {
        isActive,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { contactName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                {
                  categories: {
                    some: {
                      supplierCategory: {
                        OR: [
                          { name: { contains: search, mode: "insensitive" } },
                          { code: { contains: search, mode: "insensitive" } },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {}),
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
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(suppliers.map(serializeSupplier));
  } catch (error) {
    console.error("SCM SUPPLIERS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load suppliers." },
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
    if (!hasSupplierManageAccess(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = toCleanText(body.name, 120);
    const code = normalizeSupplierCode(body.code, name);
    const companyType = normalizeSupplierCompanyType(body.companyType);

    if (!name || !code) {
      return NextResponse.json(
        { error: "Supplier name and code are required." },
        { status: 400 },
      );
    }

    if (!companyType) {
      return NextResponse.json(
        { error: "Supplier company type is required." },
        { status: 400 },
      );
    }

    const documents = parseSupplierDocuments(body.documents);
    assertRequiredSupplierDocuments(companyType, documents);
    const categoryIds = parseSupplierCategoryIds(body.categoryIds);

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

    const created = await prisma.supplier.create({
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
        isActive: body.isActive === undefined ? true : Boolean(body.isActive),
        documents: {
          create: documents,
        },
        categories:
          categoryIds.length > 0
            ? {
                create: categoryIds.map((supplierCategoryId) => ({
                  supplierCategoryId,
                  createdById: access.userId,
                })),
              }
            : undefined,
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
      action: "create",
      entity: "supplier",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created supplier ${created.name} (${created.code})`,
      },
      after: toSupplierSnapshot(created),
    });

    return NextResponse.json(serializeSupplier(created), { status: 201 });
  } catch (error: any) {
    console.error("SCM SUPPLIERS POST ERROR:", error);
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
      { error: error?.message || "Failed to create supplier." },
      { status: 500 },
    );
  }
}
