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
  isValid: boolean;
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
    isValid: coupon.isValid,
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
  };
}

async function ensureCouponManageAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (!access.hasAny(["coupons.manage", "settings.manage"])) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, access };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const allowed = await ensureCouponManageAccess();
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
      isValid, 
      expiresAt 
    } = await req.json();
    const { id } = await params;
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        code: code.toUpperCase(),
        discountType,
        discountValue: parseFloat(discountValue),
        minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit) : null,
        isValid,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    await logActivity({
      action: "update_coupon",
      entity: "coupon",
      entityId: coupon.id,
      access: allowed.access,
      request: req,
      metadata: {
        message: `Coupon updated: ${coupon.code}`,
      },
      before: toCouponLogSnapshot(existing),
      after: toCouponLogSnapshot(coupon),
    });

    return NextResponse.json(coupon);
  } catch (error) {
    console.error("Coupon update error:", error);
    return NextResponse.json({ 
      error: "Failed to update coupon", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const allowed = await ensureCouponManageAccess();
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: allowed.status });
    }

    const { id } = await params;
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    await prisma.coupon.delete({
      where: { id }
    });

    await logActivity({
      action: "delete_coupon",
      entity: "coupon",
      entityId: existing.id,
      access: allowed.access,
      request: req,
      metadata: {
        message: `Coupon deleted: ${existing.code}`,
      },
      before: toCouponLogSnapshot(existing),
    });

    return NextResponse.json({ message: "Coupon deleted successfully" });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete coupon" },
      { status: 500 },
    );
  }
}
