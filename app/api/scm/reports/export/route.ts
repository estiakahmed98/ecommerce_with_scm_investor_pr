import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import {
  exportScmReportCsv,
  type ScmExportSection,
} from "@/lib/scm-reports";

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

const VALID_SECTIONS = new Set<ScmExportSection>([
  "pipeline",
  "vendors",
  "rfqs",
  "comparative",
  "purchase-orders",
  "grn-stock",
  "payments",
  "audit",
  "projects",
  "budgets",
  "plans",
  "mrf",
]);

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

    const section = request.nextUrl.searchParams.get("section");
    if (!section || !VALID_SECTIONS.has(section as ScmExportSection)) {
      return NextResponse.json(
        { error: "A valid export section is required." },
        { status: 400 },
      );
    }

    const exported = await exportScmReportCsv(section as ScmExportSection, {
      from: request.nextUrl.searchParams.get("from"),
      to: request.nextUrl.searchParams.get("to"),
    });

    return new NextResponse(exported.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
      },
    });
  } catch (error) {
    console.error("SCM REPORT EXPORT GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to export SCM report." },
      { status: 500 },
    );
  }
}
