import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { serializeInvestorInternalNotification } from "@/lib/investor-internal-notifications";

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function canReadInvestorNotifications(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasGlobal("investor.notifications.read");
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
    if (!canReadInvestorNotifications(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";
    const limit = toPositiveInt(request.nextUrl.searchParams.get("limit")) ?? 100;

    const rows = await prisma.investorInternalNotification.findMany({
      where: {
        userId: access.userId,
        ...(unreadOnly ? { status: "UNREAD" } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(limit, 200)),
    });

    const unreadCount = await prisma.investorInternalNotification.count({
      where: {
        userId: access.userId,
        status: "UNREAD",
      },
    });

    return NextResponse.json({
      unreadCount,
      rows: rows.map((row) => serializeInvestorInternalNotification(row)),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR NOTIFICATIONS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor notifications." },
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
    if (!canReadInvestorNotifications(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      markAll?: unknown;
    };
    const id = toPositiveInt(body.id);
    const markAll = Boolean(body.markAll);

    if (!id && !markAll) {
      return NextResponse.json(
        { error: "Notification id or markAll flag is required." },
        { status: 400 },
      );
    }

    if (markAll) {
      await prisma.investorInternalNotification.updateMany({
        where: {
          userId: access.userId,
          status: "UNREAD",
        },
        data: {
          status: "READ",
          readAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true });
    }

    const target = await prisma.investorInternalNotification.findFirst({
      where: {
        id: id!,
        userId: access.userId,
      },
      select: { id: true },
    });

    if (!target) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    await prisma.investorInternalNotification.update({
      where: { id: target.id },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, id: target.id });
  } catch (error) {
    console.error("ADMIN INVESTOR NOTIFICATIONS PATCH ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update investor notification state." },
      { status: 500 },
    );
  }
}
