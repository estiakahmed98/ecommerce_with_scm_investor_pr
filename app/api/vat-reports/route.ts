import { NextResponse } from "next/server";
import { getVatOverviewReportWithRange } from "@/lib/vat-report";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const report = await getVatOverviewReportWithRange({ from, to });
    return NextResponse.json(report, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("GET VAT REPORT ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch VAT report" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
