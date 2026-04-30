import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use /api/analytics/collect (POST) and /api/analytics/summary (GET).",
  });
}
