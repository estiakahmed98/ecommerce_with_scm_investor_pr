import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { runSupplierSlaNotifications } from "@/lib/supplier-sla-notifications";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !access.hasGlobal("sla.manage") &&
      !access.hasGlobal("sla.notifications.manage")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: unknown;
      supplierId?: unknown;
      dueInHours?: unknown;
      includeTermination?: unknown;
      maxItems?: unknown;
    };

    const supplierIdRaw = Number(body.supplierId);
    const dueInHoursRaw = Number(body.dueInHours);
    const maxItemsRaw = Number(body.maxItems);

    const result = await runSupplierSlaNotifications({
      actorUserId: access.userId,
      access,
      request,
      dryRun: body.dryRun === true,
      supplierId: Number.isInteger(supplierIdRaw) && supplierIdRaw > 0 ? supplierIdRaw : null,
      dueInHours: Number.isInteger(dueInHoursRaw) ? dueInHoursRaw : undefined,
      includeTermination: body.includeTermination !== false,
      maxItems: Number.isInteger(maxItemsRaw) ? maxItemsRaw : undefined,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("SCM SLA NOTIFICATIONS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to trigger SLA notifications." },
      { status: 500 },
    );
  }
}
