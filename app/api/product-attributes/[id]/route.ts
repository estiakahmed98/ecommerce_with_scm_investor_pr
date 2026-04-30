import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/* =========================
   UPDATE PRODUCT ATTRIBUTE
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
    const value = String(body.value || "").trim();
    if (!value) {
      return NextResponse.json({ error: "Value is required" }, { status: 400 });
    }

    const updated = await prisma.productAttribute.update({
      where: { id },
      data: { value },
      include: { attribute: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT PRODUCT ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update product attribute" },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE PRODUCT ATTRIBUTE
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

    await prisma.productAttribute.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE PRODUCT ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete product attribute" },
      { status: 500 },
    );
  }
}

