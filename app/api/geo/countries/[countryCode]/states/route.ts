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
  { params }: { params: Promise<{ countryCode: string }> },
) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing CSC API key. Set CSC_API_KEY in environment." },
        { status: 500 },
      );
    }

    const { countryCode } = await params;
    const code = String(countryCode || "").trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: "countryCode is required" }, { status: 400 });
    }

    const res = await fetch(
      `https://api.countrystatecity.in/v1/countries/${encodeURIComponent(code)}/states`,
      {
        headers: { "X-CSCAPI-KEY": apiKey },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to load states: ${body || res.statusText}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    const states = Array.isArray(data)
      ? data
          .map((item: any) => ({
            name: String(item?.name || ""),
            iso2: String(item?.iso2 || "").toUpperCase(),
          }))
          .filter((item) => item.name)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    return NextResponse.json(states);
  } catch (error) {
    console.error("GEO STATES ERROR:", error);
    return NextResponse.json({ error: "Failed to load states" }, { status: 500 });
  }
}

