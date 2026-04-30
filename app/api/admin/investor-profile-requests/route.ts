import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

function canReadProfileRequests(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("investor_profile_requests.read") || access.hasGlobal("investors.manage");
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
    if (!canReadProfileRequests(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const status = request.nextUrl.searchParams.get("status")?.trim().toUpperCase() || "";

    const rows = await prisma.investorProfileUpdateRequest.findMany({
      where: {
        ...(status && ["PENDING", "APPROVED", "REJECTED"].includes(status)
          ? { status: status as "PENDING" | "APPROVED" | "REJECTED" }
          : {}),
        ...(search
          ? {
              investor: {
                OR: [
                  { code: { contains: search, mode: "insensitive" } },
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
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
            email: true,
            status: true,
            kycStatus: true,
          },
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const counts = await prisma.investorProfileUpdateRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    return NextResponse.json({
      summary: {
        pending: counts.find((item) => item.status === "PENDING")?._count._all ?? 0,
        approved: counts.find((item) => item.status === "APPROVED")?._count._all ?? 0,
        rejected: counts.find((item) => item.status === "REJECTED")?._count._all ?? 0,
      },
      rows: rows.map((item) => ({
        ...item,
        submittedAt: item.submittedAt.toISOString(),
        reviewedAt: item.reviewedAt?.toISOString() ?? null,
        appliedAt: item.appliedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("ADMIN INVESTOR PROFILE REQUESTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor profile requests." },
      { status: 500 },
    );
  }
}
