import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalToString, resolveInvestorRequestContext } from "@/app/api/investor/shared";

export async function GET() {
  try {
    const resolved = await resolveInvestorRequestContext();

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!resolved.context.access.has("investor.portal.allocations.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allocations = await prisma.investorProductAllocation.findMany({
      where: { investorId: resolved.context.investorId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        participationPercent: true,
        committedAmount: true,
        effectiveFrom: true,
        effectiveTo: true,
        note: true,
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
      },
      take: 500,
    });

    return NextResponse.json({
      investor: {
        id: resolved.context.investorId,
        code: resolved.context.investorCode,
        name: resolved.context.investorName,
      },
      allocations: allocations.map((item) => ({
        ...item,
        participationPercent: decimalToString(item.participationPercent),
        committedAmount: decimalToString(item.committedAmount),
        effectiveFrom: item.effectiveFrom.toISOString(),
        effectiveTo: item.effectiveTo?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("INVESTOR PORTAL ALLOCATIONS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load investor allocations." }, { status: 500 });
  }
}
