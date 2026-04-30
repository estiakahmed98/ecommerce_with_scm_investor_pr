import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

const VALID_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;

function canManageInvestorPortal(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investors.manage") || access.hasGlobal("users.manage");
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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageInvestorPortal(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const [records, investors, users] = await Promise.all([
      prisma.investorPortalAccess.findMany({
        include: {
          investor: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              kycStatus: true,
            },
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
                { investor: { name: { contains: search, mode: "insensitive" } } },
                { investor: { code: { contains: search, mode: "insensitive" } } },
                { user: { email: { contains: search, mode: "insensitive" } } },
                { user: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : undefined,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.investor.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          kycStatus: true,
        },
        orderBy: [{ name: "asc" }],
      }),
      prisma.user.findMany({
        where: search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          investorPortalAccess: {
            select: { id: true, investorId: true, status: true },
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
        note: record.note,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        investor: record.investor,
        user: record.user,
        createdBy: record.createdBy,
      })),
      investors,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        investorPortalAccess: user.investorPortalAccess,
      })),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR PORTAL ACCESS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor portal access data." },
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
    if (!canManageInvestorPortal(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      userId?: unknown;
      investorId?: unknown;
      status?: unknown;
      note?: unknown;
    };

    const id = typeof body.id === "string" && body.id.trim().length > 0 ? body.id.trim() : null;
    const userId =
      typeof body.userId === "string" && body.userId.trim().length > 0 ? body.userId.trim() : null;
    const investorId = Number(body.investorId);
    const status = normalizeStatus(body.status);
    const note = cleanText(body.note, 500) || null;

    if ((!id && !userId) || !Number.isInteger(investorId) || investorId <= 0) {
      return NextResponse.json({ error: "User and investor are required." }, { status: 400 });
    }

    const target = id
      ? await prisma.investorPortalAccess.findUnique({
          where: { id },
          select: { id: true, userId: true, investorId: true, status: true, note: true },
        })
      : await prisma.investorPortalAccess.findUnique({
          where: { userId: userId as string },
          select: { id: true, userId: true, investorId: true, status: true, note: true },
        });

    const resolvedUserId = target?.userId ?? userId;
    if (!resolvedUserId) {
      return NextResponse.json({ error: "User is required." }, { status: 400 });
    }

    const [investor, user] = await Promise.all([
      prisma.investor.findUnique({
        where: { id: investorId },
        select: { id: true, code: true, name: true, status: true, kycStatus: true },
      }),
      prisma.user.findUnique({
        where: { id: resolvedUserId },
        select: { id: true, email: true, name: true, role: true },
      }),
    ]);

    if (!investor || investor.status !== "ACTIVE") {
      return NextResponse.json({ error: "Investor not found or inactive." }, { status: 404 });
    }
    if (!user || !user.email) {
      return NextResponse.json({ error: "User not found or missing email." }, { status: 404 });
    }

    const updated = await prisma.investorPortalAccess.upsert({
      where: { userId: resolvedUserId },
      create: {
        userId: resolvedUserId,
        investorId: investor.id,
        status,
        note,
        createdById: access.userId,
      },
      update: {
        investorId: investor.id,
        status,
        note,
      },
      include: {
        investor: {
          select: { id: true, code: true, name: true, status: true, kycStatus: true },
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
      entity: "investor_portal_access",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `${target ? "Updated" : "Created"} investor portal access for ${updated.user.email}`,
        investorId: updated.investor.id,
        investorCode: updated.investor.code,
        investorName: updated.investor.name,
        userId: updated.user.id,
        userEmail: updated.user.email,
        status: updated.status,
      },
      before: target
        ? {
            investorId: target.investorId,
            status: target.status,
            note: target.note,
          }
        : null,
      after: {
        investorId: updated.investor.id,
        status: updated.status,
        note: updated.note,
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        status: updated.status,
        note: updated.note,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        investor: updated.investor,
        user: updated.user,
        createdBy: updated.createdBy,
      },
      { status: target ? 200 : 201 },
    );
  } catch (error: any) {
    console.error("ADMIN INVESTOR PORTAL ACCESS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save investor portal access." },
      { status: 500 },
    );
  }
}
