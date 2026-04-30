import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { createInvestorPortalNotification } from "@/lib/investor-portal-notifications";
import {
  addScheduleFrequency,
  getScheduleWindowRange,
  isInvestorStatementScheduleOverdue,
  serializeInvestorStatementSchedule,
} from "@/lib/investor-statement-schedule";

function canReadSchedules(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_statement.read") || access.hasGlobal("investors.manage");
}

function canManageSchedules(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investors.manage");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadSchedules(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const scheduleId = Number(id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return NextResponse.json({ error: "Invalid schedule id." }, { status: 400 });
    }

    const row = await prisma.investorStatementSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            portalAccesses: { select: { status: true } },
          },
        },
      },
    });
    if (!row) {
      return NextResponse.json({ error: "Statement schedule not found." }, { status: 404 });
    }

    return NextResponse.json({
      schedule: serializeInvestorStatementSchedule(row),
      overdue: isInvestorStatementScheduleOverdue(row.nextRunAt),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR STATEMENT SCHEDULE GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor statement schedule." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageSchedules(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const scheduleId = Number(id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return NextResponse.json({ error: "Invalid schedule id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    if (!["pause", "resume", "run-now"].includes(action)) {
      return NextResponse.json({ error: "Invalid schedule action." }, { status: 400 });
    }

    const existing = await prisma.investorStatementSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            portalAccesses: { select: { status: true } },
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Statement schedule not found." }, { status: 404 });
    }

    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      if (action === "pause") {
        return tx.investorStatementSchedule.update({
          where: { id: existing.id },
          data: {
            status: "PAUSED",
            updatedById: access.userId,
          },
          include: {
            investor: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                portalAccesses: { select: { status: true } },
              },
            },
          },
        });
      }

      if (action === "resume") {
        return tx.investorStatementSchedule.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            nextRunAt: existing.nextRunAt < now ? now : existing.nextRunAt,
            updatedById: access.userId,
          },
          include: {
            investor: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                portalAccesses: { select: { status: true } },
              },
            },
          },
        });
      }

      const nextRunAt = addScheduleFrequency(now, existing.frequency);
      const window = getScheduleWindowRange(now, existing.statementWindowDays);

      const schedule = await tx.investorStatementSchedule.update({
        where: { id: existing.id },
        data: {
          lastRunAt: now,
          lastDispatchedAt: now,
          lastDispatchNote: note || null,
          nextRunAt,
          updatedById: access.userId,
        },
        include: {
          investor: {
            select: {
              id: true,
              code: true,
              name: true,
              status: true,
              portalAccesses: { select: { status: true } },
            },
          },
        },
      });

      await createInvestorPortalNotification({
        tx,
        notification: {
          investorId: existing.investorId,
          type: "STATEMENT_READY",
          title: "Investor Statement Ready",
          message: `A scheduled investor statement was generated for ${window.from.toISOString().slice(0, 10)} to ${window.to.toISOString().slice(0, 10)}.`,
          targetUrl: `/investor/statements?from=${window.from.toISOString().slice(0, 10)}&to=${window.to.toISOString().slice(0, 10)}`,
          metadata: {
            scheduleId: existing.id,
            from: window.from.toISOString(),
            to: window.to.toISOString(),
            deliveryFormat: existing.deliveryFormat,
          },
          createdById: access.userId,
        },
      });

      return schedule;
    });

    await logActivity({
      action: action.replace("-", "_"),
      entity: "investor_statement_schedule",
      entityId: existing.id,
      access,
      request,
      metadata: {
        message:
          action === "run-now"
            ? `Dispatched scheduled statement for ${existing.investor.name} (${existing.investor.code})`
            : `${action === "pause" ? "Paused" : "Resumed"} statement schedule for ${existing.investor.name} (${existing.investor.code})`,
        investorId: existing.investorId,
        note: note || null,
      },
    });

    return NextResponse.json({
      schedule: serializeInvestorStatementSchedule(updated),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR STATEMENT SCHEDULE PATCH ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update investor statement schedule." },
      { status: 500 },
    );
  }
}
