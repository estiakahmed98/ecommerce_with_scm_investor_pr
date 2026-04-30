import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("supplier.feedback.manage") ||
    access.hasGlobal("supplier.profile_requests.read")
  );
}

function canManage(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("supplier.feedback.manage");
}

function toCleanText(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toOptionalRating(value: unknown, fieldName: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(`${fieldName} must be an integer between 1 and 5.`);
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

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const supplierIdRaw = request.nextUrl.searchParams.get("supplierId");
    const supplierId =
      supplierIdRaw && Number.isInteger(Number(supplierIdRaw))
        ? Number(supplierIdRaw)
        : null;

    const [rows, suppliers] = await Promise.all([
      prisma.supplierFeedback.findMany({
        where: {
          ...(supplierId ? { supplierId } : {}),
          ...(search
            ? {
                OR: [
                  { supplier: { name: { contains: search, mode: "insensitive" } } },
                  { supplier: { code: { contains: search, mode: "insensitive" } } },
                  { clientName: { contains: search, mode: "insensitive" } },
                  { sourceReference: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 300,
        select: {
          id: true,
          sourceType: true,
          sourceReference: true,
          clientName: true,
          clientEmail: true,
          rating: true,
          serviceQualityRating: true,
          deliveryRating: true,
          complianceRating: true,
          comment: true,
          createdAt: true,
          supplier: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.supplier.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    return NextResponse.json({
      suppliers,
      rows: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("SCM SUPPLIER FEEDBACK GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier feedback." }, { status: 500 });
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
    if (!canManage(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const supplierId = Number(body.supplierId);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }

    const rating = toOptionalRating(body.rating, "Overall rating");
    if (!rating) {
      return NextResponse.json({ error: "Overall rating is required." }, { status: 400 });
    }

    const created = await prisma.supplierFeedback.create({
      data: {
        supplierId,
        sourceType:
          body.sourceType === "CLIENT" || body.sourceType === "VENDOR_SELF"
            ? body.sourceType
            : "INTERNAL",
        sourceReference: toCleanText(body.sourceReference, 120) || null,
        clientName: toCleanText(body.clientName, 120) || null,
        clientEmail: toCleanText(body.clientEmail, 120) || null,
        rating,
        serviceQualityRating: toOptionalRating(
          body.serviceQualityRating,
          "Service quality rating",
        ),
        deliveryRating: toOptionalRating(body.deliveryRating, "Delivery rating"),
        complianceRating: toOptionalRating(body.complianceRating, "Compliance rating"),
        comment: toCleanText(body.comment, 1500) || null,
        createdById: access.userId,
      },
      select: {
        id: true,
        sourceType: true,
        rating: true,
        createdAt: true,
        supplier: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    await logActivity({
      action: "create_supplier_feedback",
      entity: "supplier_feedback",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created supplier feedback for ${created.supplier.name} (${created.supplier.code})`,
        supplierId: created.supplier.id,
        rating: created.rating,
      },
      after: {
        supplierId: created.supplier.id,
        sourceType: created.sourceType,
        rating: created.rating,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        sourceType: created.sourceType,
        rating: created.rating,
        createdAt: created.createdAt.toISOString(),
        supplier: created.supplier,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("SCM SUPPLIER FEEDBACK POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create supplier feedback." },
      { status: 500 },
    );
  }
}
