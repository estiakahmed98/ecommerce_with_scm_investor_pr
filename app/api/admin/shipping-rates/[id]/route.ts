import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

const db = prisma as any;

function toShippingRateLogSnapshot(rate: {
  country: string;
  area: string;
  baseCost?: unknown;
  weightSlabs?: unknown;
  freeMinOrder?: unknown;
  isActive?: boolean;
  priority?: number;
}) {
  return {
    country: rate.country,
    area: rate.area,
    baseCost: rate.baseCost ?? null,
    weightSlabs: rate.weightSlabs ?? null,
    freeMinOrder: rate.freeMinOrder ?? null,
    isActive: rate.isActive ?? null,
    priority: rate.priority ?? null,
  };
}

function toDecimal(value: unknown, field: string): Prisma.Decimal {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${field} is required`);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return new Prisma.Decimal(num);
}

function toOptionalDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error("Optional decimal fields must be non-negative numbers");
  }
  return new Prisma.Decimal(num);
}

function validateWeightSlabs(input: unknown) {
  if (input === null || input === undefined || input === "") return null;
  if (!Array.isArray(input)) {
    throw new Error("weightSlabs must be an array");
  }

  for (const slab of input) {
    if (typeof slab !== "object" || slab === null) {
      throw new Error("Each weight slab must be an object");
    }
    const minWeight = Number((slab as any).minWeight);
    const maxWeightRaw = (slab as any).maxWeight;
    const maxWeight =
      maxWeightRaw === null || maxWeightRaw === undefined || maxWeightRaw === ""
        ? null
        : Number(maxWeightRaw);
    const cost = Number((slab as any).cost);

    if (!Number.isFinite(minWeight) || minWeight < 0) {
      throw new Error("Weight slab minWeight must be a non-negative number");
    }
    if (
      maxWeight !== null &&
      (!Number.isFinite(maxWeight) || maxWeight <= minWeight)
    ) {
      throw new Error("Weight slab maxWeight must be greater than minWeight");
    }
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error("Weight slab cost must be a non-negative number");
    }
  }

  return input;
}

async function getAdminAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  return {
    access,
    canManage: access.has("settings.shipping.manage") || access.has("settings.manage"),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { access, canManage } = await getAdminAccess();
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await db.shippingRate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Shipping rate not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: any = {};

    if (body.country !== undefined) {
      const country = String(body.country || "").trim().toUpperCase();
      if (!country) {
        return NextResponse.json({ error: "country cannot be empty" }, { status: 400 });
      }
      data.country = country;
    }
    if (body.area !== undefined) {
      const area = String(body.area || "").trim();
      if (!area) {
        return NextResponse.json({ error: "area cannot be empty" }, { status: 400 });
      }
      data.area = area;
    }
    if (body.baseCost !== undefined) data.baseCost = toDecimal(body.baseCost, "baseCost");
    if (body.weightSlabs !== undefined) data.weightSlabs = validateWeightSlabs(body.weightSlabs);
    if (body.freeMinOrder !== undefined) data.freeMinOrder = toOptionalDecimal(body.freeMinOrder);
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    if (body.priority !== undefined) {
      const num = Number(body.priority);
      if (!Number.isFinite(num)) {
        return NextResponse.json({ error: "priority must be a number" }, { status: 400 });
      }
      data.priority = num;
    }

    const updated = await db.shippingRate.update({ where: { id }, data });

    await logActivity({
      action: "update",
      entity: "shipping_rate",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated shipping rate for ${updated.area}, ${updated.country}`,
      },
      before: toShippingRateLogSnapshot(existing),
      after: toShippingRateLogSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("PATCH SHIPPING RATE ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update shipping rate" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { access, canManage } = await getAdminAccess();
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await db.shippingRate.findUnique({
      where: { id },
      select: { id: true, country: true, area: true, isActive: true },
    });

    await db.shippingRate.delete({ where: { id } });

    await logActivity({
      action: "delete",
      entity: "shipping_rate",
      entityId: id,
      access,
      request: _request,
      metadata: existing
        ? {
            message: `Deleted shipping rate for ${existing.area}, ${existing.country}`,
          }
        : {
            message: `Deleted shipping rate ${id}`,
          },
      before: existing ? toShippingRateLogSnapshot(existing) : null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE SHIPPING RATE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete shipping rate" }, { status: 500 });
  }
}
