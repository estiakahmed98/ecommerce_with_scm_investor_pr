import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { SYSTEM_PERMISSIONS } from "@/lib/rbac-config";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!access.has("roles.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await Promise.all(
      SYSTEM_PERMISSIONS.map((permission) =>
        prisma.permission.upsert({
          where: { key: permission.key },
          update: {
            description: permission.description,
          },
          create: {
            key: permission.key,
            description: permission.description,
          },
        }),
      ),
    );

    return NextResponse.json(SYSTEM_PERMISSIONS);
  } catch (error) {
    console.error("RBAC PERMISSIONS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load permissions." }, { status: 500 });
  }
}
