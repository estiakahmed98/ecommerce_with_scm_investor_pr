// app/api/wishlist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/wishlist -> current user's wishlist items + product details
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    const wishlist = await prisma.wishlist.findMany({
      where: { userId },
      include: {
        product: true,
      },
      // 🔹 createdAt নেই, তাই id দিয়ে sort করছি (নতুন আইটেম আগে)
      orderBy: {
        id: "desc",
      },
    });

    return NextResponse.json({ items: wishlist });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/wishlist
// Body: { productId: number }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const body = await request.json();
    const productId = Number(body.productId);

    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { error: "Invalid productId" },
        { status: 400 }
      );
    }

    // পণ্য আসলেই আছে কিনা চেক করা (optional but good)
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // already wishlist-e আছে কিনা (unique constraint আছে, তাই try/catch দিয়েও করা যেত)
    const existing = await prisma.wishlist.findUnique({
      where: {
        userId_productId: { userId, productId },
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Already in wishlist" },
        { status: 200 }
      );
    }

    const wishlistItem = await prisma.wishlist.create({
      data: {
        userId,
        productId,
      },
      include: {
        product: true,
      },
    });

    return NextResponse.json(wishlistItem, { status: 201 });
  } catch (error) {
    console.error("Error adding to wishlist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/wishlist?productId=123
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const { searchParams } = new URL(request.url);
    const productIdParam = searchParams.get("productId");

    if (!productIdParam) {
      return NextResponse.json(
        { error: "productId query param is required" },
        { status: 400 }
      );
    }

    const productId = Number(productIdParam);
    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { error: "Invalid productId" },
        { status: 400 }
      );
    }

    const result = await prisma.wishlist.deleteMany({
      where: {
        userId,
        productId,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { message: "Item not found in wishlist" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
