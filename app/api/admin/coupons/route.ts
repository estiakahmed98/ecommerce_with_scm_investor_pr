import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

function toCouponLogSnapshot(coupon: {
  id: string;
  code: string;
  discountType: string;
  discountValue: unknown;
  minOrderValue: unknown;
  maxDiscount: unknown;
  usageLimit: number | null;
  isValid?: boolean;
  expiresAt: Date | null;
}) {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue),
    minOrderValue:
      coupon.minOrderValue === null ? null : Number(coupon.minOrderValue),
    maxDiscount: coupon.maxDiscount === null ? null : Number(coupon.maxDiscount),
    usageLimit: coupon.usageLimit,
    isValid: coupon.isValid ?? true,
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
  };
}

async function ensureCouponAccess(permission: "read" | "manage") {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  if (permission === "read") {
    if (!access.hasAny(["coupons.manage", "settings.manage", "reports.read"])) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }
    return { ok: true as const, access };
  }

  if (!access.hasAny(["coupons.manage", "settings.manage"])) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, access };
}

export async function GET() {
  try {
    const allowed = await ensureCouponAccess("read");
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: allowed.status });
    }

    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(coupons);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch coupons" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const allowed = await ensureCouponAccess("manage");
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: allowed.status });
    }

    const { 
      code, 
      discountType, 
      discountValue, 
      minOrderValue, 
      maxDiscount, 
      usageLimit, 
      expiresAt 
    } = await req.json();

    if (!code || !discountType || !discountValue) {
      return NextResponse.json({ error: "Code, discount type, and discount value are required" }, { status: 400 });
    }

    if (!["percentage", "fixed"].includes(discountType)) {
      return NextResponse.json({ error: "Discount type must be 'percentage' or 'fixed'" }, { status: 400 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    await logActivity({
      action: "create_coupon",
      entity: "coupon",
      entityId: coupon.id,
      access: allowed.access,
      request: req,
      metadata: {
        message: `Coupon created: ${coupon.code}`,
      },
      after: toCouponLogSnapshot(coupon),
    });

    return NextResponse.json(coupon);
  } catch (error) {
    console.error("Coupon creation error:", error);
    return NextResponse.json({ 
      error: "Failed to create coupon", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
