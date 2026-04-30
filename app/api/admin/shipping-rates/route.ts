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

export async function GET(request: NextRequest) {
  try {
    const { canManage } = await getAdminAccess();

    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const area = searchParams.get("area");
    const isActive = searchParams.get("isActive");

    const where: any = {};
    if (country) where.country = country.trim().toUpperCase();
    if (area) {
      where.area = {
        equals: area.trim(),
        mode: "insensitive",
      };
    }
    if (!canManage) {
      where.isActive = true;
    } else if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    const rates = await db.shippingRate.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(rates);
  } catch (error) {
    console.error("GET SHIPPING RATES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch shipping rates" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { access, canManage } = await getAdminAccess();
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const country = String(body.country || "").trim().toUpperCase();
    const area = String(body.area || "").trim();
    if (!country) {
      return NextResponse.json({ error: "country is required" }, { status: 400 });
    }
    if (!area) {
      return NextResponse.json({ error: "area is required" }, { status: 400 });
    }

    const data: any = {
      country,
      area,
      baseCost: toDecimal(body.baseCost, "baseCost"),
      weightSlabs: validateWeightSlabs(body.weightSlabs),
      freeMinOrder: toOptionalDecimal(body.freeMinOrder),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive),
      priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 1000,
    };

    const created = await db.shippingRate.create({ data });

    await logActivity({
      action: "create",
      entity: "shipping_rate",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created shipping rate for ${created.area}, ${created.country}`,
      },
      after: toShippingRateLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("POST SHIPPING RATE ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create shipping rate" },
      { status: 500 },
    );
  }
}
