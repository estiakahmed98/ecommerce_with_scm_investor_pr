import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { serializeInvestorWithdrawalRequest } from "@/lib/investor-withdrawals";

function canReadInvestorWithdrawals(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return (
    access.hasGlobal("investor_withdrawals.read") ||
    access.hasGlobal("investor_withdrawals.review") ||
    access.hasGlobal("investor_withdrawals.settle") ||
    access.hasGlobal("investors.manage")
  );
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
    if (!canReadInvestorWithdrawals(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() || "";
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const rows = await prisma.investorWithdrawalRequest.findMany({
      where: {
        ...(status &&
        ["REQUESTED", "APPROVED", "REJECTED", "SETTLED", "CANCELLED"].includes(status)
          ? { status: status as "REQUESTED" | "APPROVED" | "REJECTED" | "SETTLED" | "CANCELLED" }
          : {}),
        ...(search
          ? {
              OR: [
                { requestNumber: { contains: search, mode: "insensitive" } },
                { investor: { code: { contains: search, mode: "insensitive" } } },
                { investor: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: 200,
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
        submittedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        settledBy: { select: { id: true, name: true, email: true } },
        transaction: {
          select: {
            id: true,
            transactionNumber: true,
            transactionDate: true,
            amount: true,
            direction: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json({
      summary: {
        requested: rows.filter((row) => row.status === "REQUESTED").length,
        approved: rows.filter((row) => row.status === "APPROVED").length,
        settled: rows.filter((row) => row.status === "SETTLED").length,
        rejected: rows.filter((row) => row.status === "REJECTED").length,
        totalRequestedAmount: rows
          .reduce((sum, row) => sum.plus(row.requestedAmount), new Prisma.Decimal(0))
          .toString(),
      },
      rows: rows.map((row) => serializeInvestorWithdrawalRequest(row)),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR WITHDRAWALS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor withdrawals." },
      { status: 500 },
    );
  }
}
