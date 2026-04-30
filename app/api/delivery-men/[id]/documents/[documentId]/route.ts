import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const { id: idParam, documentId: documentIdParam } = await params;
    
    if (!idParam || !documentIdParam) {
      return NextResponse.json(
        { success: false, message: "ID and document ID are required" },
        { status: 400 }
      );
    }

    // Check if document exists and belongs to the delivery man
    const document = await prisma.deliveryManDocument.findFirst({
      where: {
        deliveryManProfileId: idParam,
        id: documentIdParam,
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, message: "Document not found" },
        { status: 404 }
      );
    }

    // Delete the document
    await prisma.deliveryManDocument.delete({
      where: { id: documentIdParam },
    });

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("DOCUMENT_DELETE_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
