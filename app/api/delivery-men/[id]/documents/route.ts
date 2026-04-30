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
    const { type, fileUrl, fileName, mimeType, fileSize } = body;

    if (!type || !fileUrl) {
      return NextResponse.json(
        { success: false, message: "Type and fileUrl are required" },
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

    const document = await prisma.deliveryManDocument.create({
      data: {
        deliveryManProfileId: idParam,
        type,
        fileUrl,
        fileName: fileName || null,
        mimeType: mimeType || null,
        fileSize: fileSize ? Number(fileSize) : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Document uploaded successfully",
      data: document,
    });
  } catch (error) {
    console.error("DOCUMENT_UPLOAD_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
