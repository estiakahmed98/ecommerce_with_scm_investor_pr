import { NextRequest, NextResponse } from "next/server";
import { runSupplierSlaNotifications } from "@/lib/supplier-sla-notifications";

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
    const supplierIdRaw = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const dueInHoursRaw = Number(request.nextUrl.searchParams.get("dueInHours") || "24");
    const maxItemsRaw = Number(request.nextUrl.searchParams.get("maxItems") || "100");

    const result = await runSupplierSlaNotifications({
      actorUserId: null,
      access: null,
      request,
      dryRun: false,
      supplierId:
        Number.isInteger(supplierIdRaw) && supplierIdRaw > 0 ? supplierIdRaw : null,
      dueInHours: Number.isInteger(dueInHoursRaw) ? dueInHoursRaw : 24,
      includeTermination: true,
      maxItems: Number.isInteger(maxItemsRaw) ? maxItemsRaw : 100,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error("SCM SLA CRON NOTIFICATIONS ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to run SLA notification cron." },
      { status: 500 },
    );
  }
}
