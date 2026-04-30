import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  sanitizeInvestorMasterSnapshot,
  serializeInvestorMasterChangeRequest,
} from "@/lib/investor-master";

function canManageInvestors(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investors.manage");
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
    if (!canManageInvestors(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const changeRequestId = Number(id);
    if (!Number.isInteger(changeRequestId) || changeRequestId <= 0) {
      return NextResponse.json({ error: "Invalid change request id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const reviewNote =
      typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 500) : "";

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid change request action." }, { status: 400 });
    }

    const existing = await prisma.investorMasterChangeRequest.findUnique({
      where: { id: changeRequestId },
      include: {
        investor: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Change request not found." }, { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending requests can be reviewed." }, { status: 400 });
    }
    if (existing.requestedById && existing.requestedById === access.userId) {
      return NextResponse.json(
        { error: "Requesters cannot approve or reject their own investor master changes." },
        { status: 403 },
      );
    }

    const before = sanitizeInvestorMasterSnapshot(existing.investor);
    const requestedChanges =
      (existing.requestedChanges as Record<string, unknown> | null) ?? {};

    let reviewed = existing;
    if (action === "approve") {
      reviewed = await prisma.$transaction(async (tx) => {
        const updatedInvestor = await tx.investor.update({
          where: { id: existing.investorId },
          data: requestedChanges,
        });

        const updatedRequest = await tx.investorMasterChangeRequest.update({
          where: { id: existing.id },
          data: {
            status: "APPROVED",
            reviewNote: reviewNote || null,
            reviewedById: access.userId,
            reviewedAt: new Date(),
            appliedAt: new Date(),
          },
          include: {
            investor: true,
            requestedBy: { select: { id: true, name: true, email: true } },
            reviewedBy: { select: { id: true, name: true, email: true } },
          },
        });

        await tx.activityLog.create({
          data: {
            userId: access.userId,
            action: "update",
            entity: "investor",
            entityId: String(updatedInvestor.id),
            metadata: {
              message: `Approved investor master change for ${updatedInvestor.name} (${updatedInvestor.code})`,
              before,
              after: sanitizeInvestorMasterSnapshot(updatedInvestor),
            },
            updatetAt: new Date(),
          },
        });

        return updatedRequest;
      });
    } else {
      reviewed = await prisma.investorMasterChangeRequest.update({
        where: { id: existing.id },
        data: {
          status: "REJECTED",
          reviewNote: reviewNote || null,
          reviewedById: access.userId,
          reviewedAt: new Date(),
          appliedAt: null,
        },
        include: {
          investor: true,
          requestedBy: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
      });
    }

    await logActivity({
      action: action === "approve" ? "approve" : "reject",
      entity: "investor_master_change_request",
      entityId: String(reviewed.id),
      access,
      request,
      metadata: {
        message: `${action === "approve" ? "Approved" : "Rejected"} investor master change request for ${existing.investor.name} (${existing.investor.code})`,
        investorId: existing.investorId,
      },
      before: existing.currentSnapshot as Record<string, unknown> | null,
      after:
        action === "approve"
          ? sanitizeInvestorMasterSnapshot(reviewed.investor)
          : (existing.requestedChanges as Record<string, unknown> | null),
    });

    return NextResponse.json(serializeInvestorMasterChangeRequest(reviewed));
  } catch (error: any) {
    console.error("INVESTOR CHANGE REQUEST REVIEW ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to review investor master change request." },
      { status: 500 },
    );
  }
}
