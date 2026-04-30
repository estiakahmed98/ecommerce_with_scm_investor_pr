import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/* =========================
   UPDATE ATTRIBUTE
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const updated = await prisma.attribute.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update attribute" },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE ATTRIBUTE
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

    await prisma.$transaction(async (tx) => {
      await tx.productAttribute.deleteMany({ where: { attributeId: id } });
      await tx.attributeValue.deleteMany({ where: { attributeId: id } });
      await tx.attribute.delete({ where: { id } });
    });

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete attribute" },
      { status: 500 },
    );
  }
}

