import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const BIN_PERMISSIONS = ["warehouse_locations.read", "inventory.manage"] as const;

function toCleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadBins(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...BIN_PERMISSIONS]);
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
    if (!canReadBins(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const search = toCleanText(request.nextUrl.searchParams.get("search"), 120);

    const where: Prisma.StockBinLevelWhereInput = {};
    const hasGlobalScope =
      access.isSuperAdmin ||
      access.hasGlobal("warehouse_locations.read") ||
      access.hasGlobal("inventory.manage");
    if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json([]);
      }
      where.warehouseId = warehouseId;
    } else if (!hasGlobalScope && access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    } else if (!hasGlobalScope && access.warehouseIds.length === 0) {
      return NextResponse.json([]);
    }

    if (search) {
      where.OR = [
        { variant: { sku: { contains: search, mode: "insensitive" } } },
        { variant: { product: { name: { contains: search, mode: "insensitive" } } } },
        { bin: { code: { contains: search, mode: "insensitive" } } },
        { bin: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const levels = await prisma.stockBinLevel.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        bin: {
          select: {
            id: true,
            code: true,
            name: true,
            aisle: { select: { id: true, code: true, name: true } },
            zone: { select: { id: true, code: true, name: true } },
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ warehouseId: "asc" }, { binId: "asc" }],
      take: 500,
    });

    return NextResponse.json(levels);
  } catch (error) {
    console.error("STOCK BIN LEVELS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load bin stock levels." },
      { status: 500 },
    );
  }
}
