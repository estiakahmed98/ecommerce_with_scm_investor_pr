import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { getScmDashboardOverview } from "@/lib/scm-reports";

const SCM_REPORT_READ_PERMISSIONS = [
  "dashboard.read",
  "purchase_requisitions.read",
  "rfq.read",
  "comparative_statements.read",
  "purchase_orders.read",
  "goods_receipts.read",
  "payment_requests.read",
  "payment_reports.read",
  "stock_reports.read",
  "supplier_performance.read",
  "supplier.feedback.manage",
  "sla.read",
  "supplier_ledger.read",
  "three_way_match.read",
] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!access.hasAny([...SCM_REPORT_READ_PERMISSIONS])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const report = await getScmDashboardOverview({
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to"),
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("SCM DASHBOARD OVERVIEW GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load SCM dashboard overview." },
      { status: 500 },
    );
  }
}
