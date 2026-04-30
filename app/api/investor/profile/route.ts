import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveInvestorRequestContext } from "@/app/api/investor/shared";
import {
  buildInvestorDirectChangePayload,
  buildInvestorSensitiveChangePayload,
  hasMeaningfulInvestorChanges,
  sanitizeInvestorMasterSnapshot,
} from "@/lib/investor-master";
import { createInvestorPortalNotification } from "@/lib/investor-portal-notifications";
import { createInvestorInternalNotificationsForPermissions } from "@/lib/investor-internal-notifications";

function stripUnsupportedPortalFields(body: Record<string, unknown>) {
  const next = { ...body };
  delete next.status;
  delete next.kycReference;
  return next;
}

export async function GET() {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("investor.portal.profile.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [investor, requests] = await Promise.all([
      prisma.investor.findUnique({
        where: { id: resolved.context.investorId },
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
          beneficiaryVerifiedAt: true,
          beneficiaryVerificationNote: true,
          status: true,
          kycStatus: true,
          notes: true,
          updatedAt: true,
        },
      }),
      prisma.investorProfileUpdateRequest.findMany({
        where: {
          investorId: resolved.context.investorId,
        },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        take: 20,
        include: {
          submittedBy: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    if (!investor) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    return NextResponse.json({
      investor: {
        ...investor,
        beneficiaryVerifiedAt: investor.beneficiaryVerifiedAt?.toISOString() ?? null,
        updatedAt: investor.updatedAt.toISOString(),
      },
      requests: requests.map((item) => ({
        ...item,
        submittedAt: item.submittedAt.toISOString(),
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
        appliedAt: item.appliedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL PROFILE GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor profile." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("investor.portal.profile.submit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = stripUnsupportedPortalFields(
      ((await request.json().catch(() => ({}))) as Record<string, unknown>) ?? {},
    );
    const directPayload = buildInvestorDirectChangePayload(body);
    const sensitivePayload = buildInvestorSensitiveChangePayload(body);
    const requestNote =
      typeof body.requestNote === "string" ? body.requestNote.trim().slice(0, 500) : "";

    const existing = await prisma.investor.findUnique({
      where: { id: resolved.context.investorId },
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

    const requestedChanges = Object.fromEntries(
      Object.entries({ ...directPayload, ...sensitivePayload }).filter(
        ([, value]) => value !== undefined,
      ),
    );

    if (directPayload.name !== undefined && !directPayload.name) {
      return NextResponse.json({ error: "Display name cannot be empty." }, { status: 400 });
    }

    if (
      !hasMeaningfulInvestorChanges(requestedChanges, sanitizeInvestorMasterSnapshot(existing))
    ) {
      return NextResponse.json({ error: "No profile changes were submitted." }, { status: 400 });
    }

    const pendingCount = await prisma.investorProfileUpdateRequest.count({
      where: {
        investorId: resolved.context.investorId,
        status: "PENDING",
      },
    });
    if (pendingCount >= 5) {
      return NextResponse.json(
        { error: "Too many pending profile requests. Wait for review first." },
        { status: 429 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const requestRow = await tx.investorProfileUpdateRequest.create({
        data: {
          investorId: resolved.context.investorId,
          status: "PENDING",
          requestedChanges,
          currentSnapshot: sanitizeInvestorMasterSnapshot(existing),
          requestNote: requestNote || null,
          submittedById: resolved.context.userId,
        },
      });

      await createInvestorPortalNotification({
        tx,
        notification: {
          investorId: resolved.context.investorId,
          type: "PROFILE_UPDATE_REQUEST",
          title: "Profile Update Submitted",
          message: "Your investor profile update request is waiting for admin review.",
          targetUrl: "/investor/profile",
          metadata: { requestId: requestRow.id },
          createdById: resolved.context.userId,
        },
      });

      await createInvestorInternalNotificationsForPermissions({
        tx,
        permissionKeys: ["investor_profile_requests.review", "investors.manage"],
        notification: {
          type: "PROFILE_REQUEST",
          title: "Investor Profile Request Submitted",
          message: `${existing.name} (${existing.code}) submitted a profile or beneficiary update request and is waiting for review.`,
          targetUrl: "/admin/investors/profile-requests",
          entity: "investor_profile_update_request",
          entityId: String(requestRow.id),
          metadata: {
            requestId: requestRow.id,
            investorId: existing.id,
            investorCode: existing.code,
          },
          createdById: resolved.context.userId,
        },
        excludeUserIds: resolved.context.userId ? [resolved.context.userId] : [],
      });

      return requestRow;
    });

    return NextResponse.json(
      {
        request: {
          ...created,
          submittedAt: created.submittedAt.toISOString(),
          reviewedAt: created.reviewedAt?.toISOString() ?? null,
          appliedAt: created.appliedAt?.toISOString() ?? null,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("INVESTOR PORTAL PROFILE POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to submit investor profile request." },
      { status: 500 },
    );
  }
}
