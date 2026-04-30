import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSupplierPortalContext } from "@/lib/supplier-portal";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("supplier.feedback.read")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.supplierFeedback.findMany({
      where: {
        supplierId: resolved.context.supplierId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        sourceType: true,
        sourceReference: true,
        clientName: true,
        clientEmail: true,
        rating: true,
        serviceQualityRating: true,
        deliveryRating: true,
        complianceRating: true,
        comment: true,
        createdAt: true,
      },
    });

    const summary =
      rows.length === 0
        ? { count: 0, avgRating: null }
        : {
            count: rows.length,
            avgRating:
              rows.reduce((sum, row) => sum + row.rating, 0) / rows.length,
          };

    return NextResponse.json({
      summary,
      rows: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("SUPPLIER FEEDBACK GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier feedback." }, { status: 500 });
  }
}
