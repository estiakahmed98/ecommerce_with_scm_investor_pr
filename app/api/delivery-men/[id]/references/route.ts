import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    
    if (!idParam) {
      return NextResponse.json(
        { success: false, message: "Delivery man ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, phone, relation, address, occupation, identityType, identityNumber } = body;

    if (!name || !phone || !identityNumber) {
      return NextResponse.json(
        { success: false, message: "Name, phone, and identity number are required" },
        { status: 400 }
      );
    }

    // Check if delivery man exists
    const deliveryMan = await prisma.deliveryManProfile.findUnique({
      where: { id: idParam },
    });

    if (!deliveryMan) {
      return NextResponse.json(
        { success: false, message: "Delivery man not found" },
        { status: 404 }
      );
    }

    const reference = await prisma.deliveryManReference.create({
      data: {
        deliveryManProfileId: deliveryMan.id,
        name,
        phone,
        relation: relation || null,
        address: address || null,
        occupation: occupation || null,
        identityType: identityType || "NID",
        identityNumber,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Reference added successfully",
      data: reference,
    });
  } catch (error) {
    console.error("REFERENCE_CREATE_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
