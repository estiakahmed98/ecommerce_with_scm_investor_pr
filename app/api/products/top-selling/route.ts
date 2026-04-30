import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const top = await prisma.product.findMany({
      where: {
        deleted: false,
        available: true,
        soldCount: {
          gt: 0,
        },
      },
      orderBy: {
        soldCount: "desc",
      },
      take: 10,
      include: {
        writer: true,
        publisher: true,
        category: true,
        brand: true,
        variants: true,
      },
    });

    // If no products have been sold yet, fallback to latest available products
    if (top.length === 0) {
      const fallbackProducts = await prisma.product.findMany({
        where: {
          deleted: false,
          available: true,
        },
        orderBy: { id: "desc" },
        take: 10,
        include: {
          writer: true,
          publisher: true,
          category: true,
          brand: true,
          variants: true,
        },
      });
      return NextResponse.json(
        fallbackProducts.map((p, i) => ({
          ...p,
          totalSold: p.soldCount ?? 0,
          rank: i + 1,
        })),
      );
    }

    return NextResponse.json(
      top.map((p, i) => ({
        ...p,
        totalSold: p.soldCount ?? 0,
        rank: i + 1,
      })),
    );
  } catch (error) {
    console.error('Error fetching top selling products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top selling products' },
      { status: 500 }
    );
  }
}
