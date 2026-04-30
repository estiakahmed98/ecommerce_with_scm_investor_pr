import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { exportReportCsv } from "@/lib/reports";

const VALID_SECTIONS = new Set(["sales", "profit", "vat", "inventory", "delivery"]);

async function ensureReportAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  if (!access.has("reports.read")) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  try {
    const allowed = await ensureReportAccess();
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.error }, { status: allowed.status });
    }

    const { searchParams } = new URL(request.url);
    const section = String(searchParams.get("section") || "sales");

    if (!VALID_SECTIONS.has(section)) {
      return NextResponse.json({ error: "Invalid report section" }, { status: 400 });
    }

    const csv = await exportReportCsv(section as "sales" | "profit" | "vat" | "inventory" | "delivery", {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    const filename = `${section}-report-${searchParams.get("from") || "range"}-${searchParams.get("to") || "today"}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to export report CSV:", error);
    return NextResponse.json(
      { error: "Failed to export report CSV" },
      { status: 500 },
    );
  }
}
