import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const ASSET_READ_PERMISSIONS = ["asset_register.read", "asset_register.manage"] as const;

function toCleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadAssets(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...ASSET_READ_PERMISSIONS]);
}

function hasGlobalAssetScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return ASSET_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
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
    if (!canReadAssets(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const statusFilter = toCleanText(request.nextUrl.searchParams.get("status"), 40).toUpperCase();
    const search = toCleanText(request.nextUrl.searchParams.get("search"), 120);

    const where: Prisma.AssetRegisterWhereInput = {};
    if (statusFilter && ["ACTIVE", "RETIRED", "LOST", "DISPOSED"].includes(statusFilter)) {
      where.status = statusFilter as any;
    }
    if (search) {
      where.OR = [
        { assetTag: { contains: search, mode: "insensitive" } },
        { assignedTo: { contains: search, mode: "insensitive" } },
        {
          productVariant: {
            sku: { contains: search, mode: "insensitive" },
          },
        },
        {
          productVariant: {
            product: {
              name: { contains: search, mode: "insensitive" },
            },
          },
        },
      ];
    }

    const globalScope = hasGlobalAssetScope(access);
    if (globalScope) {
      if (Number.isInteger(warehouseId) && warehouseId > 0) {
        where.warehouseId = warehouseId;
      }
    } else if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json({ assets: [], summary: { total: 0, active: 0, retired: 0, lost: 0, disposed: 0 } });
      }
      where.warehouseId = warehouseId;
    } else if (access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    } else {
      return NextResponse.json({ assets: [], summary: { total: 0, active: 0, retired: 0, lost: 0, disposed: 0 } });
    }

    const assets = await prisma.assetRegister.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
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
        materialRequest: {
          select: {
            id: true,
            requestNumber: true,
          },
        },
        materialReleaseNote: {
          select: {
            id: true,
            releaseNumber: true,
            challanNumber: true,
            waybillNumber: true,
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
      orderBy: [{ acquiredAt: "desc" }, { id: "desc" }],
      take: 800,
    });

    const summary = {
      total: assets.length,
      active: assets.filter((asset) => asset.status === "ACTIVE").length,
      retired: assets.filter((asset) => asset.status === "RETIRED").length,
      lost: assets.filter((asset) => asset.status === "LOST").length,
      disposed: assets.filter((asset) => asset.status === "DISPOSED").length,
    };

    return NextResponse.json({ assets, summary });
  } catch (error) {
    console.error("SCM ASSETS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load assets." }, { status: 500 });
  }
}
