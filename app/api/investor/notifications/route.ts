import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveInvestorRequestContext } from "@/app/api/investor/shared";
import { serializeInvestorPortalNotification } from "@/lib/investor-portal-notifications";

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("investor.portal.notifications.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";
    const rows = await prisma.investorPortalNotification.findMany({
      where: {
        investorId: resolved.context.investorId,
        ...(unreadOnly ? { status: "UNREAD" } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });

    const unreadCount = await prisma.investorPortalNotification.count({
      where: {
        investorId: resolved.context.investorId,
        status: "UNREAD",
      },
    });

    return NextResponse.json({
      unreadCount,
      rows: rows.map((row) => serializeInvestorPortalNotification(row)),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL NOTIFICATIONS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("investor.portal.notifications.read")) {
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
      await prisma.investorPortalNotification.updateMany({
        where: {
          investorId: resolved.context.investorId,
          status: "UNREAD",
        },
        data: {
          status: "READ",
          readAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true });
    }

    const target = await prisma.investorPortalNotification.findFirst({
      where: {
        id: id!,
        investorId: resolved.context.investorId,
      },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    await prisma.investorPortalNotification.update({
      where: { id: target.id },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, id: target.id });
  } catch (error) {
    console.error("INVESTOR PORTAL NOTIFICATIONS PATCH ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update investor notification state." },
      { status: 500 },
    );
  }
}
