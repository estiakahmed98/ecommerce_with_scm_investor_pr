import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { toCleanText, toInvestorSnapshot } from "@/lib/investor";

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
    const investorId = Number(id);
    if (!Number.isInteger(investorId) || investorId <= 0) {
      return NextResponse.json({ error: "Invalid investor id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim().toLowerCase();
    const note = toCleanText(body.note, 500) || null;
    if (!["verify", "revoke"].includes(action)) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

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
        beneficiaryVerifiedAt: true,
        beneficiaryVerificationNote: true,
        beneficiaryVerifiedById: true,
        status: true,
        kycStatus: true,
        kycReference: true,
        notes: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Investor not found." }, { status: 404 });
    }

    if (action === "verify") {
      if (!existing.bankName || !existing.bankAccountName || !existing.bankAccountNumber) {
        return NextResponse.json(
          { error: "Bank name, account name, and account number are required before beneficiary verification." },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.investor.update({
      where: { id: investorId },
      data:
        action === "verify"
          ? {
              beneficiaryVerifiedAt: new Date(),
              beneficiaryVerifiedById: access.userId,
              beneficiaryVerificationNote: note,
            }
          : {
              beneficiaryVerifiedAt: null,
              beneficiaryVerifiedById: null,
              beneficiaryVerificationNote: note || "Beneficiary verification revoked.",
            },
    });

    await logActivity({
      action: action === "verify" ? "verify" : "revoke",
      entity: "investor_beneficiary_verification",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message:
          action === "verify"
            ? `Verified payout beneficiary for ${updated.name} (${updated.code})`
            : `Revoked payout beneficiary verification for ${updated.name} (${updated.code})`,
        note,
      },
      before: toInvestorSnapshot(existing),
      after: toInvestorSnapshot(updated),
    });

    return NextResponse.json({
      beneficiaryVerifiedAt: updated.beneficiaryVerifiedAt?.toISOString() ?? null,
      beneficiaryVerificationNote: updated.beneficiaryVerificationNote ?? null,
      beneficiaryVerifiedById: updated.beneficiaryVerifiedById ?? null,
    });
  } catch (error: any) {
    console.error("INVESTOR BENEFICIARY VERIFICATION PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update investor beneficiary verification." },
      { status: 500 },
    );
  }
}
