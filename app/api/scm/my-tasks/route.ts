import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { getScmMyTasks } from "@/lib/scm-workspace";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!access.hasAny(["scm.access"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await getScmMyTasks(access);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("SCM MY TASKS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load SCM task workspace." },
      { status: 500 },
    );
  }
}
