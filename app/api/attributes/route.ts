import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/* =========================
   GET ATTRIBUTES
========================= */
export async function GET() {
  try {
    const attributes = await prisma.attribute.findMany({
      orderBy: { id: "desc" },
      include: {
        values: {
          orderBy: { id: "desc" },
        },
      },
    });

    return NextResponse.json(attributes);
  } catch (error) {
    console.error("GET ATTRIBUTES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch attributes" },
      { status: 500 },
    );
  }
}

/* =========================
   CREATE ATTRIBUTE
========================= */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const created = await prisma.attribute.create({
      data: { name },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create attribute" },
      { status: 500 },
    );
  }
}

