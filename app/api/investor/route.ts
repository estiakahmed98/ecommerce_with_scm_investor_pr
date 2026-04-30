// app/api/investor/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated and has admin role
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify admin permissions
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    const isAdmin = user?.userRoles?.some(
      (ur) => ur.role.name === "ADMIN" || ur.role.name === "SUPER_ADMIN",
    );

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const kycStatus = searchParams.get("kycStatus");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { legalName: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (kycStatus) {
      where.kycStatus = kycStatus;
    }

    // Build order by
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    // Fetch investors with their related data
    const investors = await prisma.investor.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        transactions: {
          orderBy: {
            transactionDate: "desc",
          },
          take: 5,
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            productVariant: {
              include: {
                product: {
                  select: {
                    name: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
        allocations: {
          where: {
            status: "ACTIVE",
          },
          include: {
            productVariant: {
              include: {
                product: {
                  select: {
                    name: true,
                    slug: true,
                  },
                },
              },
            },
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        profitRunAllocations: {
          orderBy: {
            createdAt: "desc",
          },
          take: 3,
          include: {
            run: {
              select: {
                runNumber: true,
                fromDate: true,
                toDate: true,
                status: true,
              },
            },
            productVariant: {
              include: {
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        payouts: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            approvedBy: {
              select: {
                name: true,
                email: true,
              },
            },
            paidBy: {
              select: {
                name: true,
                email: true,
              },
            },
            run: {
              select: {
                runNumber: true,
                fromDate: true,
                toDate: true,
              },
            },
          },
        },
        portalAccesses: {
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Get total count for pagination
    const total = await prisma.investor.count({ where });

    // Calculate summary statistics
    const summary = await prisma.$transaction([
      prisma.investorCapitalTransaction.aggregate({
        where: {
          investorId: { in: investors.map((i) => i.id) },
          direction: "CREDIT",
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.investorCapitalTransaction.aggregate({
        where: {
          investorId: { in: investors.map((i) => i.id) },
          direction: "DEBIT",
        },
        _sum: {
          amount: true,
        },
      }),
      prisma.investorProfitPayout.aggregate({
        where: {
          investorId: { in: investors.map((i) => i.id) },
          status: "PAID",
        },
        _sum: {
          payoutAmount: true,
        },
      }),
    ]);

    const totalCapitalCommitted = summary[0]._sum.amount || 0;
    const totalCapitalWithdrawn = summary[1]._sum.amount || 0;
    const totalPayoutsPaid = summary[2]._sum.payoutAmount || 0;

    return NextResponse.json({
      success: true,
      data: investors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalInvestors: total,
        totalCapitalCommitted,
        totalCapitalWithdrawn,
        netCapital:
          Number(totalCapitalCommitted) - Number(totalCapitalWithdrawn),
        totalPayoutsPaid,
      },
    });
  } catch (error) {
    console.error("Error fetching investors:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
