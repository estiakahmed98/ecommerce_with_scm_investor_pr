import { NextResponse } from "next/server";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // ✅ Total Books (only active + not deleted)
    const totalBooks = await prisma.product.count({
      where: {
        deleted: false,
        available: true,
        writer: { deleted: false },
        publisher: { deleted: false },
        category: { deleted: false }
      }
    });

    // ✅ Total Writers (only active)
    const totalWriters = await prisma.writer.count({
      where: { deleted: false }
    });

    // ✅ Total Delivered Orders
    const totalDelivered = await prisma.order.count({
      where: { status: "DELIVERED" }
    });

    return NextResponse.json({
      totalBooks,
      totalWriters,
      totalDelivered,
    });
  } catch (error) {
    console.error("Stats API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
