import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/* =========================
   DELETE ATTRIBUTE VALUE
========================= */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await prisma.attributeValue.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE ATTRIBUTE VALUE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete attribute value" },
      { status: 500 },
    );
  }
}

