import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

const ASSET_READ_PERMISSIONS = ["asset_register.read", "asset_register.manage"] as const;

function toCleanText(value: unknown, max = 400) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadAssets(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...ASSET_READ_PERMISSIONS]);
}

function toAssetSnapshot(asset: {
  assetTag: string;
  warehouseId: number;
  productVariantId: number;
  status: string;
  assignedTo: string | null;
  note: string | null;
  acquiredAt: Date;
}) {
  return {
    assetTag: asset.assetTag,
    warehouseId: asset.warehouseId,
    productVariantId: asset.productVariantId,
    status: asset.status,
    assignedTo: asset.assignedTo,
    note: asset.note,
    acquiredAt: asset.acquiredAt.toISOString(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const assetId = Number(id);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      return NextResponse.json({ error: "Invalid asset id." }, { status: 400 });
    }

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

    const asset = await prisma.assetRegister.findUnique({
      where: { id: assetId },
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
      },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }
    if (!access.canAccessWarehouse(asset.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    console.error("SCM ASSET GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load asset." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const assetId = Number(id);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      return NextResponse.json({ error: "Invalid asset id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.assetRegister.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        assetTag: true,
        warehouseId: true,
        productVariantId: true,
        status: true,
        assignedTo: true,
        note: true,
        acquiredAt: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }
    if (!access.can("asset_register.manage", existing.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      status?: unknown;
      assignedTo?: unknown;
      note?: unknown;
    };

    const nextStatus = toCleanText(body.status, 40).toUpperCase();
    if (nextStatus && !["ACTIVE", "RETIRED", "LOST", "DISPOSED"].includes(nextStatus)) {
      return NextResponse.json({ error: "Invalid asset status." }, { status: 400 });
    }

    const updated = await prisma.assetRegister.update({
      where: { id: assetId },
      data: {
        status: nextStatus ? (nextStatus as any) : undefined,
        assignedTo:
          body.assignedTo === undefined
            ? undefined
            : toCleanText(body.assignedTo, 160) || null,
        note: body.note === undefined ? undefined : toCleanText(body.note, 500) || null,
      },
      select: {
        id: true,
        assetTag: true,
        warehouseId: true,
        productVariantId: true,
        status: true,
        assignedTo: true,
        note: true,
        acquiredAt: true,
      },
    });

    await logActivity({
      action: "update",
      entity: "asset_register",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated asset lifecycle ${updated.assetTag}`,
      },
      before: toAssetSnapshot(existing),
      after: toAssetSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("SCM ASSET PATCH ERROR:", error);
    return NextResponse.json({ error: "Failed to update asset." }, { status: 500 });
  }
}
