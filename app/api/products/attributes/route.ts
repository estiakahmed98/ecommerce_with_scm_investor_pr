import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/* =========================
   GET ALL PRODUCT ATTRIBUTES
========================= */
export async function GET() {
  try {
    const productAttributes = await prisma.productAttribute.findMany({
      orderBy: { id: "desc" },
      include: {
        attribute: {
          include: {
            values: true,
          },
        },
      },
    });

    return NextResponse.json(productAttributes);
  } catch (error) {
    console.error("GET ALL PRODUCT ATTRIBUTES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch product attributes" },
      { status: 500 }
    );
  }
}
