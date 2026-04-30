import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  dateRangesOverlap,
  parseInvestorAllocationStatus,
  sumParticipationPercent,
} from "@/lib/investor-allocation";
import { toCleanText } from "@/lib/investor";

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

async function resolveAllocationId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const allocationId = Number(id);
  if (!Number.isInteger(allocationId) || allocationId <= 0) {
    throw new Error("Invalid allocation id.");
  }
  return allocationId;
}

function serializeAllocation(allocation: any) {
  return {
    ...allocation,
    participationPercent: allocation.participationPercent?.toString() ?? null,
    committedAmount: allocation.committedAmount?.toString() ?? null,
    effectiveFrom: allocation.effectiveFrom.toISOString(),
    effectiveTo: allocation.effectiveTo?.toISOString() ?? null,
    createdAt: allocation.createdAt.toISOString(),
    updatedAt: allocation.updatedAt.toISOString(),
  };
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
    if (!canReadInvestorAllocations(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allocationId = await resolveAllocationId(params);
    const allocation = await prisma.investorProductAllocation.findUnique({
      where: { id: allocationId },
      include: {
        investor: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            kycStatus: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            sku: true,
            active: true,
            product: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!allocation) {
      return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
    }

    const [variantAllocations, investorTransactions, relatedProfitLines] = await Promise.all([
      prisma.investorProductAllocation.findMany({
        where: {
          productVariantId: allocation.productVariantId,
        },
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
        include: {
          investor: {
            select: { id: true, code: true, name: true, status: true },
          },
        },
        take: 100,
      }),
      prisma.investorCapitalTransaction.findMany({
        where: {
          investorId: allocation.investorId,
          productVariantId: allocation.productVariantId,
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          transactionNumber: true,
          transactionDate: true,
          type: true,
          direction: true,
          amount: true,
          currency: true,
        },
      }),
      prisma.investorProfitRunAllocation.findMany({
        where: {
          investorId: allocation.investorId,
          productVariantId: allocation.productVariantId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        include: {
          run: {
            select: {
              id: true,
              runNumber: true,
              fromDate: true,
              toDate: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const overlappingAllocations = variantAllocations.filter(
      (item) =>
        item.id !== allocation.id &&
        dateRangesOverlap({
          startA: item.effectiveFrom,
          endA: item.effectiveTo,
          startB: allocation.effectiveFrom,
          endB: allocation.effectiveTo,
        }),
    );

    const overlapPercent = sumParticipationPercent(
      variantAllocations.filter((item) =>
        dateRangesOverlap({
          startA: item.effectiveFrom,
          endA: item.effectiveTo,
          startB: allocation.effectiveFrom,
          endB: allocation.effectiveTo,
        }),
      ),
    );

    return NextResponse.json({
      allocation: serializeAllocation(allocation),
      overlappingAllocations: overlappingAllocations.map((item) => serializeAllocation(item)),
      productVariantAllocationPercent: overlapPercent.toString(),
      investorTransactions: investorTransactions.map((item) => ({
        ...item,
        amount: item.amount.toString(),
        transactionDate: item.transactionDate.toISOString(),
      })),
      relatedProfitLines: relatedProfitLines.map((item) => ({
        id: item.id,
        allocatedRevenue: item.allocatedRevenue.toString(),
        allocatedNetProfit: item.allocatedNetProfit.toString(),
        participationSharePct: item.participationSharePct.toString(),
        profitRun: {
          ...item.run,
          fromDate: item.run.fromDate.toISOString(),
          toDate: item.run.toDate.toISOString(),
        },
      })),
    });
  } catch (error: any) {
    console.error("ADMIN INVESTOR ALLOCATION DETAIL GET ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to load allocation detail." },
      { status: error?.message === "Invalid allocation id." ? 400 : 500 },
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
    if (!canManageInvestorAllocations(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allocationId = await resolveAllocationId(params);
    const existing = await prisma.investorProductAllocation.findUnique({
      where: { id: allocationId },
      include: {
        investor: { select: { id: true, status: true, name: true, code: true } },
        productVariant: { select: { id: true, active: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status !== undefined ? parseInvestorAllocationStatus(body.status) : existing.status as any;
    const note = body.note !== undefined ? toCleanText(body.note, 500) || null : existing.note;
    const effectiveTo =
      body.effectiveTo === undefined
        ? existing.effectiveTo
        : body.effectiveTo === null || body.effectiveTo === ""
          ? null
          : new Date(String(body.effectiveTo));

    if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
      return NextResponse.json({ error: "Invalid effective end date." }, { status: 400 });
    }
    if (effectiveTo && effectiveTo < existing.effectiveFrom) {
      return NextResponse.json(
        { error: "Effective end date must be after start date." },
        { status: 400 },
      );
    }

    if (status === "ACTIVE" && existing.investor.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only ACTIVE investors can keep ACTIVE allocations." },
        { status: 400 },
      );
    }
    if (status === "ACTIVE" && !existing.productVariant.active) {
      return NextResponse.json(
        { error: "Cannot activate allocation for an inactive product variant." },
        { status: 400 },
      );
    }

    const overlapping = await prisma.investorProductAllocation.findMany({
      where: {
        id: { not: existing.id },
        productVariantId: existing.productVariantId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        investorId: true,
        participationPercent: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });

    const overlappingActiveAllocations = overlapping.filter((item) =>
      dateRangesOverlap({
        startA: item.effectiveFrom,
        endA: item.effectiveTo,
        startB: existing.effectiveFrom,
        endB: effectiveTo,
      }),
    );

    if (status === "ACTIVE") {
      if (overlappingActiveAllocations.some((item) => item.investorId === existing.investorId)) {
        return NextResponse.json(
          { error: "An overlapping ACTIVE allocation already exists for this investor and product variant." },
          { status: 400 },
        );
      }
      if (existing.participationPercent) {
        const totalPercent = sumParticipationPercent(overlappingActiveAllocations).plus(
          existing.participationPercent,
        );
        if (totalPercent.gt(100)) {
          return NextResponse.json(
            { error: "Overlapping active allocations exceed 100% participation for this product variant." },
            { status: 400 },
          );
        }
      }
    }

    const updated = await prisma.investorProductAllocation.update({
      where: { id: existing.id },
      data: {
        status,
        note,
        effectiveTo: status === "CLOSED" ? effectiveTo ?? new Date() : effectiveTo,
      },
      include: {
        investor: {
          select: { id: true, code: true, name: true, status: true },
        },
        productVariant: {
          select: {
            id: true,
            sku: true,
            product: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await logActivity({
      action: "update",
      entity: "investor_product_allocation",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated investor allocation ${updated.id} for ${updated.investor.name} (${updated.investor.code})`,
      },
      before: {
        status: existing.status,
        note: existing.note,
        effectiveTo: existing.effectiveTo?.toISOString() ?? null,
      },
      after: {
        status: updated.status,
        note: updated.note,
        effectiveTo: updated.effectiveTo?.toISOString() ?? null,
      },
    });

    return NextResponse.json(serializeAllocation(updated));
  } catch (error: any) {
    console.error("ADMIN INVESTOR ALLOCATION DETAIL PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update allocation." },
      { status: error?.message === "Invalid allocation id." ? 400 : 500 },
    );
  }
}
