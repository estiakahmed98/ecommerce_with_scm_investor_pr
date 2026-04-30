import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { toCleanText, toDecimalAmount } from "@/lib/investor";
import {
  dateRangesOverlap,
  parseInvestorAllocationStatus,
  sumParticipationPercent,
} from "@/lib/investor-allocation";

function canReadInvestorAllocations(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return (
    access.hasGlobal("investor_allocations.read") ||
    access.hasGlobal("investor_allocations.manage") ||
    access.hasGlobal("investor_profit.read") ||
    access.hasGlobal("investor_profit.manage") ||
    access.hasGlobal("investor_profit.approve") ||
    access.hasGlobal("investor_profit.post") ||
    access.hasGlobal("investor_payout.read") ||
    access.hasGlobal("investor_payout.manage") ||
    access.hasGlobal("investor_payout.approve") ||
    access.hasGlobal("investor_payout.pay") ||
    access.hasGlobal("investor_payout.void") ||
    access.hasGlobal("investor_statement.read")
  );
}

function canManageInvestorAllocations(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_allocations.manage");
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
    if (!canReadInvestorAllocations(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const investorId = Number(request.nextUrl.searchParams.get("investorId") || "");
    const allocations = await prisma.investorProductAllocation.findMany({
      where:
        Number.isInteger(investorId) && investorId > 0
          ? { investorId }
          : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            sku: true,
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      take: 600,
    });

    return NextResponse.json(
      allocations.map((allocation) => ({
        ...allocation,
        participationPercent: allocation.participationPercent?.toString() ?? null,
        committedAmount: allocation.committedAmount?.toString() ?? null,
        effectiveFrom: allocation.effectiveFrom.toISOString(),
        effectiveTo: allocation.effectiveTo?.toISOString() ?? null,
        createdAt: allocation.createdAt.toISOString(),
        updatedAt: allocation.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    console.error("ADMIN INVESTOR ALLOCATIONS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor allocations." },
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
    if (!canManageInvestorAllocations(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      investorId?: unknown;
      productVariantId?: unknown;
      effectiveFrom?: unknown;
      effectiveTo?: unknown;
      participationPercent?: unknown;
      committedAmount?: unknown;
      status?: unknown;
      note?: unknown;
    };

    const investorId = Number(body.investorId);
    const productVariantId = Number(body.productVariantId);

    if (!Number.isInteger(investorId) || investorId <= 0) {
      return NextResponse.json({ error: "Investor is required." }, { status: 400 });
    }
    if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
      return NextResponse.json({ error: "Product variant is required." }, { status: 400 });
    }

    const participationPercent =
      body.participationPercent === null ||
      body.participationPercent === undefined ||
      body.participationPercent === ""
        ? null
        : toDecimalAmount(body.participationPercent, "Participation percent");
    if (participationPercent && participationPercent.gt(100)) {
      return NextResponse.json(
        { error: "Participation percent cannot exceed 100." },
        { status: 400 },
      );
    }

    const committedAmount =
      body.committedAmount === null ||
      body.committedAmount === undefined ||
      body.committedAmount === ""
        ? null
        : toDecimalAmount(body.committedAmount, "Committed amount");

    if (!participationPercent && !committedAmount) {
      return NextResponse.json(
        { error: "Set participation percent or committed amount." },
        { status: 400 },
      );
    }

    const effectiveFrom = body.effectiveFrom
      ? new Date(String(body.effectiveFrom))
      : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) {
      return NextResponse.json({ error: "Invalid effective start date." }, { status: 400 });
    }
    const effectiveTo =
      body.effectiveTo === null || body.effectiveTo === undefined || body.effectiveTo === ""
        ? null
        : new Date(String(body.effectiveTo));
    if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
      return NextResponse.json({ error: "Invalid effective end date." }, { status: 400 });
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return NextResponse.json(
        { error: "Effective end date must be after start date." },
        { status: 400 },
      );
    }

    const status = parseInvestorAllocationStatus(body.status);
    const note = toCleanText(body.note, 500) || null;

    const created = await prisma.$transaction(async (tx) => {
      const [investor, variant, existingAllocations] = await Promise.all([
        tx.investor.findUnique({
          where: { id: investorId },
          select: { id: true, status: true },
        }),
        tx.productVariant.findUnique({
          where: { id: productVariantId },
          select: { id: true, active: true },
        }),
        tx.investorProductAllocation.findMany({
          where: {
            productVariantId,
            status: "ACTIVE",
          },
          select: {
            id: true,
            investorId: true,
            participationPercent: true,
            effectiveFrom: true,
            effectiveTo: true,
            status: true,
          },
        }),
      ]);

      if (!investor) {
        throw new Error("Investor not found.");
      }
      if (investor.status !== "ACTIVE") {
        throw new Error("Only ACTIVE investors can receive allocations.");
      }
      if (!variant || !variant.active) {
        throw new Error("Selected product variant is not active.");
      }

      const overlappingActiveAllocations = existingAllocations.filter((allocation) =>
        dateRangesOverlap({
          startA: allocation.effectiveFrom,
          endA: allocation.effectiveTo,
          startB: effectiveFrom,
          endB: effectiveTo,
        }),
      );

      if (
        status === "ACTIVE" &&
        overlappingActiveAllocations.some((allocation) => allocation.investorId === investorId)
      ) {
        throw new Error(
          "An overlapping ACTIVE allocation already exists for this investor and product variant.",
        );
      }

      if (status === "ACTIVE" && participationPercent) {
        const totalPercent = sumParticipationPercent(overlappingActiveAllocations).plus(
          participationPercent,
        );
        if (totalPercent.gt(100)) {
          throw new Error(
            "Overlapping active allocations exceed 100% participation for this product variant.",
          );
        }
      }

      return tx.investorProductAllocation.create({
        data: {
          investorId,
          productVariantId,
          effectiveFrom,
          effectiveTo,
          participationPercent,
          committedAmount,
          status,
          note,
          createdById: access.userId,
        },
      });
    });

    await logActivity({
      action: "create",
      entity: "investor_product_allocation",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created investor allocation for investor ${created.investorId} and variant ${created.productVariantId}`,
      },
      after: {
        investorId: created.investorId,
        productVariantId: created.productVariantId,
        status: created.status,
        participationPercent: created.participationPercent?.toString() ?? null,
        committedAmount: created.committedAmount?.toString() ?? null,
        effectiveFrom: created.effectiveFrom.toISOString(),
        effectiveTo: created.effectiveTo?.toISOString() ?? null,
      },
    });

    return NextResponse.json(
      {
        ...created,
        participationPercent: created.participationPercent?.toString() ?? null,
        committedAmount: created.committedAmount?.toString() ?? null,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("ADMIN INVESTOR ALLOCATIONS POST ERROR:", error);
    const message = String(error?.message || "");
    if (
      message.includes("required") ||
      message.includes("Invalid") ||
      message.includes("must be") ||
      message.includes("cannot exceed") ||
      message.includes("already exists") ||
      message.includes("Only ACTIVE investors")
    ) {
      return NextResponse.json({ error: message || "Invalid request." }, { status: 400 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message || "Resource not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: message || "Failed to create investor allocation." },
      { status: 500 },
    );
  }
}
