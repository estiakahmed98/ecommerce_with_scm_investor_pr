import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import {
  canAccessInvestorWorkspace,
  getInvestorWorkspacePayload,
} from "@/lib/investor-workspace";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canAccessInvestorWorkspace(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await getInvestorWorkspacePayload(access);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("ADMIN INVESTOR WORKSPACE GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load investor workspace." },
      { status: 500 },
    );
  }
}
