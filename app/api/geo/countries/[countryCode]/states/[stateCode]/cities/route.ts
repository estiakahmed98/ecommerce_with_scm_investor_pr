import { NextRequest, NextResponse } from "next/server";

function getApiKey() {
  return (
    process.env.CSC_API_KEY ||
    process.env.COUNTRYSTATECITY_API_KEY ||
    process.env.NEXT_PUBLIC_CSC_API_KEY
  );
}

export async function GET(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ countryCode: string; stateCode: string }> },
) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing CSC API key. Set CSC_API_KEY in environment." },
        { status: 500 },
      );
    }

    const { countryCode, stateCode } = await params;
    const country = String(countryCode || "").trim().toUpperCase();
    const state = String(stateCode || "").trim().toUpperCase();

    if (!country || !state) {
      return NextResponse.json(
        { error: "countryCode and stateCode are required" },
        { status: 400 },
      );
    }

    const res = await fetch(
      `https://api.countrystatecity.in/v1/countries/${encodeURIComponent(country)}/states/${encodeURIComponent(state)}/cities`,
      {
        headers: { "X-CSCAPI-KEY": apiKey },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to load cities: ${body || res.statusText}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    const cities = Array.isArray(data)
      ? data
          .map((item: any) => ({
            id: item?.id,
            name: String(item?.name || ""),
          }))
          .filter((item) => item.name)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    return NextResponse.json(cities);
  } catch (error) {
    console.error("GEO CITIES ERROR:", error);
    return NextResponse.json({ error: "Failed to load cities" }, { status: 500 });
  }
}
