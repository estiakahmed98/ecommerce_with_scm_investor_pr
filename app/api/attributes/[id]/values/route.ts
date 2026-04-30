import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/* =========================
   CREATE ATTRIBUTE VALUE
========================= */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const attributeId = Number(idParam);
    if (!attributeId || Number.isNaN(attributeId)) {
      return NextResponse.json(
        { error: "Invalid attribute id" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const value = String(body.value || "").trim();
    if (!value) {
      return NextResponse.json({ error: "Value is required" }, { status: 400 });
    }

    const created = await prisma.attributeValue.create({
      data: { attributeId, value },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST ATTRIBUTE VALUE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create attribute value" },
      { status: 500 },
    );
  }
}

