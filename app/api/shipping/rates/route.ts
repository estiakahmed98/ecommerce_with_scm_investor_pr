import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
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
    
    // Only return active rates for public API
    where.isActive = isActive === null ? true : isActive === "true";

    const rates = await prisma.shippingRate.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        country: true,
        district: true,
        area: true,
        baseCost: true,
        freeMinOrder: true,
        isActive: true,
        priority: true,
      }
    });

    return NextResponse.json(rates);
  } catch (error) {
    console.error("GET PUBLIC SHIPPING RATES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch shipping rates" },
      { status: 500 },
    );
  }
}
