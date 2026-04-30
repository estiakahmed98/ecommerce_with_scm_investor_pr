import { NextRequest, NextResponse } from "next/server";
import { calculateShippingQuote } from "@/lib/shipping";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const country = String(body?.country || "").trim();
    const district = String(body?.district || "").trim();
    const area = String(body?.area || "").trim();
    const subtotal = Number(body?.subtotal || 0);

    if (!country || !district || !area) {
      return NextResponse.json(
        { error: "country, district and area are required" },
        { status: 400 },
      );
    }

    const quote = await calculateShippingQuote({
      country,
      district,
      area,
      subtotal,
    });

    return NextResponse.json(quote);
  } catch (error) {
    console.error("SHIPPING QUOTE ERROR:", error);
    return NextResponse.json({ error: "Failed to calculate shipping quote" }, { status: 500 });
  }
}

