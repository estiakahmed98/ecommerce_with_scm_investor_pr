import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { productIds } = await request.json();

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "Product IDs array is required" },
        { status: 400 }
      );
    }

    // Fetch ratings for all products in one query
    const ratings = await prisma.review.groupBy({
      by: ['productId'],
      where: {
        productId: {
          in: productIds
        }
      },
      _avg: {
        rating: true
      },
      _count: {
        rating: true
      }
    });

    // Format the response
    const ratingsMap = productIds.reduce((acc, productId) => {
      const rating = ratings.find((r: any) => r.productId === productId);
      acc[String(productId)] = {
        averageRating: rating?._avg.rating || 0,
        totalReviews: rating?._count.rating || 0
      };
      return acc;
    }, {} as Record<string, { averageRating: number; totalReviews: number }>);

    return NextResponse.json({
      success: true,
      data: ratingsMap
    });

  } catch (error) {
    console.error("Error fetching batch ratings:", error);
    return NextResponse.json(
      { error: "Failed to fetch ratings" },
      { status: 500 }
    );
  }
}
