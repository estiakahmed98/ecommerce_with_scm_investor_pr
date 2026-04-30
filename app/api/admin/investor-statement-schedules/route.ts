import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  buildInitialInvestorStatementNextRunAt,
  serializeInvestorStatementSchedule,
} from "@/lib/investor-statement-schedule";

function canReadSchedules(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_statement.read") || access.hasGlobal("investors.manage");
}

function canManageSchedules(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investors.manage");
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
    if (!canReadSchedules(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const investorId = Number(request.nextUrl.searchParams.get("investorId") || "");
    const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() || "";
    const dueOnly = request.nextUrl.searchParams.get("dueOnly") === "true";
    const now = new Date();

    const rows = await prisma.investorStatementSchedule.findMany({
      where: {
        ...(Number.isInteger(investorId) && investorId > 0 ? { investorId } : {}),
        ...(status && ["ACTIVE", "PAUSED"].includes(status)
          ? { status: status as "ACTIVE" | "PAUSED" }
          : {}),
        ...(dueOnly ? { nextRunAt: { lte: now }, status: "ACTIVE" } : {}),
      },
      orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
      take: 300,
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            portalAccesses: {
              select: { status: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      schedules: rows.map((row) => serializeInvestorStatementSchedule(row)),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR STATEMENT SCHEDULES GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor statement schedules." },
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
    if (!canManageSchedules(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const investorId = Number(body.investorId || "");
    const frequency = String(body.frequency || "").trim().toUpperCase();
    const deliveryFormat = String(body.deliveryFormat || "PDF").trim().toUpperCase();
    const statementWindowDays = Number(body.statementWindowDays || 30);
    const nextRunAt = buildInitialInvestorStatementNextRunAt(
      typeof body.nextRunAt === "string" ? body.nextRunAt : null,
    );

    if (!Number.isInteger(investorId) || investorId <= 0) {
      return NextResponse.json({ error: "Valid investor is required." }, { status: 400 });
    }
    if (!["WEEKLY", "MONTHLY", "QUARTERLY"].includes(frequency)) {
      return NextResponse.json({ error: "Valid schedule frequency is required." }, { status: 400 });
    }
    if (!["CSV", "PDF", "BOTH"].includes(deliveryFormat)) {
      return NextResponse.json({ error: "Valid delivery format is required." }, { status: 400 });
    }
    if (!Number.isInteger(statementWindowDays) || statementWindowDays < 1 || statementWindowDays > 365) {
      return NextResponse.json(
        { error: "Statement window must be between 1 and 365 days." },
        { status: 400 },
      );
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: { id: true, code: true, name: true },
    });
    if (!investor) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    const existing = await prisma.investorStatementSchedule.findFirst({
      where: {
        investorId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An active statement schedule already exists for this investor." },
        { status: 400 },
      );
    }

    const created = await prisma.investorStatementSchedule.create({
      data: {
        investorId,
        frequency: frequency as "WEEKLY" | "MONTHLY" | "QUARTERLY",
        deliveryFormat: deliveryFormat as "CSV" | "PDF" | "BOTH",
        statementWindowDays,
        nextRunAt,
        createdById: access.userId,
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

    await logActivity({
      action: "create",
      entity: "investor_statement_schedule",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created statement schedule for ${investor.name} (${investor.code})`,
        investorId,
        frequency,
        deliveryFormat,
      },
    });

    return NextResponse.json({
      schedule: serializeInvestorStatementSchedule(created),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR STATEMENT SCHEDULES POST ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create investor statement schedule." },
      { status: 500 },
    );
  }
}
