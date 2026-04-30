import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

const VALID_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;

function canManageSupplierPortal(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("suppliers.manage") || access.hasGlobal("users.manage");
}

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeStatus(value: unknown) {
  if (typeof value !== "string") return "ACTIVE" as const;
  const normalized = value.trim().toUpperCase();
  return VALID_STATUSES.includes(normalized as (typeof VALID_STATUSES)[number])
    ? (normalized as (typeof VALID_STATUSES)[number])
    : "ACTIVE";
}

function normalizeTwoFactorMethod(value: unknown) {
  const cleaned = cleanText(value, 40).toUpperCase();
  if (!cleaned) return null;
  if (cleaned === "EMAIL_OTP" || cleaned === "TOTP" || cleaned === "AUTH_APP") {
    return cleaned;
  }
  return "EMAIL_OTP";
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
    if (!canManageSupplierPortal(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const [records, suppliers, users] = await Promise.all([
      prisma.supplierPortalAccess.findMany({
        include: {
          supplier: {
            select: { id: true, code: true, name: true, isActive: true },
          },
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        where: search
          ? {
              OR: [
                { supplier: { name: { contains: search, mode: "insensitive" } } },
                { supplier: { code: { contains: search, mode: "insensitive" } } },
                { user: { email: { contains: search, mode: "insensitive" } } },
                { user: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : undefined,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.supplier.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, isActive: true },
        orderBy: [{ name: "asc" }],
      }),
      prisma.user.findMany({
        where: {
          email: { not: "" },
          ...(search
            ? {
                OR: [
                  { email: { contains: search, mode: "insensitive" } },
                  { name: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          supplierPortalAccess: {
            select: { id: true, supplierId: true, status: true },
          },
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: 300,
      }),
    ]);

    return NextResponse.json({
      records: records.map((record) => ({
        id: record.id,
        status: record.status,
        twoFactorRequired: record.twoFactorRequired,
        twoFactorMethod: record.twoFactorMethod,
        twoFactorLastVerifiedAt: record.twoFactorLastVerifiedAt?.toISOString() ?? null,
        note: record.note,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        supplier: record.supplier,
        user: record.user,
        createdBy: record.createdBy,
      })),
      suppliers,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        supplierPortalAccess: user.supplierPortalAccess,
      })),
    });
  } catch (error) {
    console.error("ADMIN SUPPLIER PORTAL ACCESS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier portal access data." },
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
    if (!canManageSupplierPortal(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      userId?: unknown;
      supplierId?: unknown;
      status?: unknown;
      twoFactorRequired?: unknown;
      twoFactorMethod?: unknown;
      note?: unknown;
    };

    const id =
      typeof body.id === "string" && body.id.trim().length > 0 ? body.id.trim() : null;
    const userId =
      typeof body.userId === "string" && body.userId.trim().length > 0
        ? body.userId.trim()
        : null;
    const supplierId = Number(body.supplierId);
    const status = normalizeStatus(body.status);
    const twoFactorRequired = Boolean(body.twoFactorRequired);
    const twoFactorMethod = twoFactorRequired
      ? normalizeTwoFactorMethod(body.twoFactorMethod)
      : null;
    const note = cleanText(body.note, 500) || null;

    if ((!id && !userId) || !Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json(
        { error: "User and supplier are required." },
        { status: 400 },
      );
    }

    const target = id
      ? await prisma.supplierPortalAccess.findUnique({
          where: { id },
          select: {
            id: true,
            userId: true,
            supplierId: true,
            status: true,
            twoFactorRequired: true,
            twoFactorMethod: true,
            note: true,
          },
        })
      : await prisma.supplierPortalAccess.findUnique({
          where: { userId: userId as string },
          select: {
            id: true,
            userId: true,
            supplierId: true,
            status: true,
            twoFactorRequired: true,
            twoFactorMethod: true,
            note: true,
          },
        });

    const resolvedUserId = target?.userId ?? userId;
    if (!resolvedUserId) {
      return NextResponse.json({ error: "User is required." }, { status: 400 });
    }

    const [supplier, user] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, code: true, name: true, isActive: true },
      }),
      prisma.user.findUnique({
        where: { id: resolvedUserId },
        select: { id: true, email: true, name: true, role: true },
      }),
    ]);

    if (!supplier || !supplier.isActive) {
      return NextResponse.json(
        { error: "Supplier not found or inactive." },
        { status: 404 },
      );
    }
    if (!user || !user.email) {
      return NextResponse.json(
        { error: "User not found or missing email." },
        { status: 404 },
      );
    }

    const updated = await prisma.supplierPortalAccess.upsert({
      where: { userId: resolvedUserId },
      create: {
        userId: resolvedUserId,
        supplierId: supplier.id,
        status,
        twoFactorRequired,
        twoFactorMethod,
        note,
        createdById: access.userId,
      },
      update: {
        supplierId: supplier.id,
        status,
        twoFactorRequired,
        twoFactorMethod,
        note,
      },
      include: {
        supplier: {
          select: { id: true, code: true, name: true, isActive: true },
        },
        user: {
          select: { id: true, email: true, name: true, role: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await logActivity({
      action: target ? "update" : "create",
      entity: "supplier_portal_access",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `${target ? "Updated" : "Created"} supplier portal access for ${updated.user.email}`,
        supplierId: updated.supplier.id,
        supplierCode: updated.supplier.code,
        supplierName: updated.supplier.name,
        userId: updated.user.id,
        userEmail: updated.user.email,
        status: updated.status,
        twoFactorRequired: updated.twoFactorRequired,
        twoFactorMethod: updated.twoFactorMethod,
      },
      before: target
        ? {
            supplierId: target.supplierId,
            status: target.status,
            twoFactorRequired: target.twoFactorRequired,
            twoFactorMethod: target.twoFactorMethod,
            note: target.note,
          }
        : null,
      after: {
        supplierId: updated.supplier.id,
        status: updated.status,
        twoFactorRequired: updated.twoFactorRequired,
        twoFactorMethod: updated.twoFactorMethod,
        note: updated.note,
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        status: updated.status,
        twoFactorRequired: updated.twoFactorRequired,
        twoFactorMethod: updated.twoFactorMethod,
        twoFactorLastVerifiedAt: updated.twoFactorLastVerifiedAt?.toISOString() ?? null,
        note: updated.note,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        supplier: updated.supplier,
        user: updated.user,
        createdBy: updated.createdBy,
      },
      { status: target ? 200 : 201 },
    );
  } catch (error: any) {
    console.error("ADMIN SUPPLIER PORTAL ACCESS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save supplier portal access." },
      { status: 500 },
    );
  }
}
