import { NextResponse } from "next/server";

function getApiKey() {
  return (
    process.env.CSC_API_KEY ||
    process.env.COUNTRYSTATECITY_API_KEY ||
    process.env.NEXT_PUBLIC_CSC_API_KEY
  );
}

export async function GET() {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing CSC API key. Set CSC_API_KEY in environment." },
        { status: 500 },
      );
    }

    const res = await fetch("https://api.countrystatecity.in/v1/countries", {
      headers: { "X-CSCAPI-KEY": apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to load countries: ${body || res.statusText}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    const countries = Array.isArray(data)
      ? data
          .map((item: any) => ({
            name: String(item?.name || ""),
            iso2: String(item?.iso2 || "").toUpperCase(),
          }))
          .filter((item) => item.name && item.iso2)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    return NextResponse.json(countries);
  } catch (error) {
    console.error("GEO COUNTRIES ERROR:", error);
    return NextResponse.json({ error: "Failed to load countries" }, { status: 500 });
  }
}

