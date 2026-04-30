import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/* =========================
   GET PRODUCT ATTRIBUTES
   Required query: ?productId=1
========================= */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productIdParam = url.searchParams.get("productId");
    const productId = productIdParam ? Number(productIdParam) : null;

    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 },
      );
    }

    const attrs = await prisma.productAttribute.findMany({
      where: { productId },
      orderBy: { id: "desc" },
      include: {
        attribute: true,
      },
    });

    return NextResponse.json(attrs);
  } catch (error) {
    console.error("GET PRODUCT ATTRIBUTES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch product attributes" },
      { status: 500 },
    );
  }
}

/* =========================
   CREATE PRODUCT ATTRIBUTE
========================= */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const productId = Number(body.productId);
    const attributeId = Number(body.attributeId);
    const value = String(body.value || "").trim();

    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 },
      );
    }

    if (!attributeId || Number.isNaN(attributeId)) {
      return NextResponse.json(
        { error: "attributeId is required" },
        { status: 400 },
      );
    }

    if (!value) {
      return NextResponse.json({ error: "Value is required" }, { status: 400 });
    }

    const created = await prisma.productAttribute.create({
      data: {
        productId,
        attributeId,
        value,
      },
      include: { attribute: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST PRODUCT ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create product attribute" },
      { status: 500 },
    );
  }
}

