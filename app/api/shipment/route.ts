import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET all shipments
export async function GET() {
  try {
    const shipments = await prisma.shipment.findMany({
      include: {
        order: true,
        warehouse: true,
        items: {
          include: {
            orderItem: {
              include: {
                product: true,
                variant: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(shipments);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch shipments" },
      { status: 500 },
    );
  }
}

// CREATE shipment
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const shipment = await prisma.shipment.create({
      data: {
        orderId: body.orderId,
        warehouseId: body.warehouseId ?? null,
        courier: body.courier,
        trackingNumber: body.trackingNumber ?? null,
        status: body.status ?? "PENDING",
        shippedAt: body.shippedAt ? new Date(body.shippedAt) : null,
        expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
        items: body.items
          ? {
              create: body.items.map((item: any) => ({
                orderItemId: item.orderItemId,
                quantity: item.quantity,
              })),
            }
          : undefined,
      },
      include: {
        order: true,
        warehouse: true,
        items: true,
      },
    });

    return NextResponse.json(shipment, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create shipment" },
      { status: 500 },
    );
  }
}
