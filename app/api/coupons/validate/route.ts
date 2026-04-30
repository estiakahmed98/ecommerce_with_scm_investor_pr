import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { code, subtotal } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (!coupon) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 404 });
    }

    // Check if coupon is valid
        if (!coupon.isValid) {
        return NextResponse.json({ error: "Coupon is inactive" }, { status: 400 });
    }

    // Check if coupon is expired
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Coupon has expired" }, { status: 400 });
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return NextResponse.json({ error: "Coupon usage limit exceeded" }, { status: 400 });
    }

    // Check minimum order value
    if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
      return NextResponse.json({ 
        error: `Minimum order value of ৳${coupon.minOrderValue} required` 
      }, { status: 400 });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = (subtotal * Number(coupon.discountValue)) / 100;
      // Apply max discount limit if set
      if (coupon.maxDiscount && discountAmount > Number(coupon.maxDiscount)) {
        discountAmount = Number(coupon.maxDiscount);
      }
    } else {
      discountAmount = Number(coupon.discountValue);
    }

    // Return coupon validation without incrementing usage count
    // Usage count will be incremented when order is placed
    return NextResponse.json({
      success: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount
      }
    });

  } catch (error) {
    console.error("Coupon validation error:", error);
    return NextResponse.json({ 
      error: "Failed to validate coupon", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
