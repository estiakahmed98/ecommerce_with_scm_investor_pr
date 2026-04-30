import { NextRequest, NextResponse } from "next/server";
import { captureAllInventoryDailySnapshots } from "@/lib/report-backfill";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const custom = request.headers.get("x-cron-secret");

  return bearer === secret || custom === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const result = await captureAllInventoryDailySnapshots();
    return NextResponse.json({
      ok: true,
      capturedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("Failed to capture inventory snapshots:", error);
    return NextResponse.json(
      { error: "Failed to capture inventory snapshots" },
      { status: 500 },
    );
  }
}
