import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  buildInvestorSensitiveChangePayload,
  hasMeaningfulInvestorChanges,
  sanitizeInvestorMasterSnapshot,
  serializeInvestorMasterChangeRequest,
} from "@/lib/investor-master";

function canManageInvestors(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investors.manage");
}

async function resolveInvestorId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const investorId = Number(id);
  if (!Number.isInteger(investorId) || investorId <= 0) {
    throw new Error("Invalid investor id.");
  }
  return investorId;
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
    if (!canManageInvestors(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const investorId = await resolveInvestorId(params);
    const requests = await prisma.investorMasterChangeRequest.findMany({
      where: { investorId },
      orderBy: [{ requestedAt: "desc" }],
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(requests.map((request) => serializeInvestorMasterChangeRequest(request)));
  } catch (error: any) {
    console.error("INVESTOR CHANGE REQUESTS GET ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load investor change requests." },
      { status: error?.message === "Invalid investor id." ? 400 : 500 },
    );
  }
}

export async function POST(
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
    if (!canManageInvestors(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const investorId = await resolveInvestorId(params);
    const existing = await prisma.investor.findUnique({
      where: { id: investorId },
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
        email: true,
        phone: true,
        taxNumber: true,
        nationalIdNumber: true,
        passportNumber: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        status: true,
        kycStatus: true,
        kycReference: true,
        notes: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedChanges = buildInvestorSensitiveChangePayload(body);
    const current = sanitizeInvestorMasterSnapshot(existing);

    if (!hasMeaningfulInvestorChanges(requestedChanges as Record<string, unknown>, current)) {
      return NextResponse.json(
        { error: "No sensitive fields changed." },
        { status: 400 },
      );
    }

    const pending = await prisma.investorMasterChangeRequest.findFirst({
      where: {
        investorId,
        status: "PENDING",
      },
      select: { id: true },
    });

    if (pending) {
      return NextResponse.json(
        { error: "A pending investor master change request already exists." },
        { status: 409 },
      );
    }

    const created = await prisma.investorMasterChangeRequest.create({
      data: {
        investorId,
        status: "PENDING",
        requestedChanges,
        currentSnapshot: current,
        changeSummary:
          typeof body.changeSummary === "string" ? body.changeSummary.trim().slice(0, 500) : null,
        requestedById: access.userId,
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await logActivity({
      action: "create",
      entity: "investor_master_change_request",
      entityId: String(created.id),
      access,
      request,
      metadata: {
        message: `Submitted investor master change request for ${existing.name} (${existing.code})`,
        investorId,
      },
      before: current,
      after: requestedChanges as Record<string, unknown>,
    });

    return NextResponse.json(serializeInvestorMasterChangeRequest(created), { status: 201 });
  } catch (error: any) {
    console.error("INVESTOR CHANGE REQUESTS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to submit investor change request." },
      { status: error?.message === "Invalid investor id." ? 400 : 500 },
    );
  }
}
