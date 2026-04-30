import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { getReportsOverview } from "@/lib/reports";

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
    const data = await getReportsOverview({
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load reports overview:", error);
    return NextResponse.json(
      { error: "Failed to load reports overview" },
      { status: 500 },
    );
  }
}
