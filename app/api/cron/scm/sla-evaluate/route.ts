import { NextRequest, NextResponse } from "next/server";
import { runSupplierSlaEvaluation } from "@/lib/supplier-sla";

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
    const supplierId =
      Number.isInteger(supplierIdRaw) && supplierIdRaw > 0 ? supplierIdRaw : null;

    const result = await runSupplierSlaEvaluation({
      supplierId,
      includeInactive: false,
      autoOnly: true,
      actorUserId: null,
      access: null,
      request,
    });

    return NextResponse.json({
      ok: true,
      generatedAt: result.generatedAt,
      count: result.count,
      rows: result.rows,
    });
  } catch (error: any) {
    console.error("SCM SLA CRON EVALUATE ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to run SLA cron evaluation." },
      { status: 500 },
    );
  }
}
