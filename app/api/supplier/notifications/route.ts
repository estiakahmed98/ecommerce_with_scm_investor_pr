import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSupplierPortalContext } from "@/lib/supplier-portal";

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("supplier.notifications.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";
    const typeRaw = request.nextUrl.searchParams.get("type")?.trim() || "";
    const validTypes = new Set([
      "GENERAL",
      "DOCUMENT_EXPIRY",
      "APPROVAL",
      "RFQ",
      "WORK_ORDER",
      "PAYMENT",
    ]);
    const type = validTypes.has(typeRaw) ? typeRaw : "";

    const [rows, unreadCount] = await Promise.all([
      prisma.supplierPortalNotification.findMany({
        where: {
          supplierId: resolved.context.supplierId,
          OR: [{ userId: null }, { userId: resolved.context.userId }],
          ...(unreadOnly ? { readAt: null } : {}),
          ...(type
            ? {
                type: type as
                  | "GENERAL"
                  | "DOCUMENT_EXPIRY"
                  | "APPROVAL"
                  | "RFQ"
                  | "WORK_ORDER"
                  | "PAYMENT",
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
        select: {
          id: true,
          channel: true,
          status: true,
          type: true,
          title: true,
          message: true,
          metadata: true,
          sentAt: true,
          readAt: true,
          createdAt: true,
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

    return NextResponse.json({
      unreadCount,
      rows: rows.map((row) => ({
        ...row,
        sentAt: row.sentAt?.toISOString() ?? null,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("SUPPLIER NOTIFICATIONS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
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
    if (!resolved.context.access.has("supplier.notifications.read")) {
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
      await prisma.supplierPortalNotification.updateMany({
        where: {
          supplierId: resolved.context.supplierId,
          OR: [{ userId: null }, { userId: resolved.context.userId }],
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true });
    }

    const target = await prisma.supplierPortalNotification.findFirst({
      where: {
        id: id!,
        supplierId: resolved.context.supplierId,
        OR: [{ userId: null }, { userId: resolved.context.userId }],
      },
      select: { id: true },
    });

    if (!target) {
      return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    }

    await prisma.supplierPortalNotification.update({
      where: { id: target.id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, id: target.id });
  } catch (error) {
    console.error("SUPPLIER NOTIFICATIONS PATCH ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update notification state." },
      { status: 500 },
    );
  }
}
