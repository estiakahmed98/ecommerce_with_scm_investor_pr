import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const SLA_OWNER_READ_PERMISSIONS = ["sla.read", "sla.manage"] as const;

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return SLA_OWNER_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canRead(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [{ banned: false }, { banned: null }],
        userRoles: {
          some: {
            role: {
              deletedAt: null,
              rolePermissions: {
                some: {
                  permission: {
                    key: {
                      in: ["sla.read", "sla.manage"],
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        userRoles: {
          where: {
            role: {
              deletedAt: null,
            },
          },
          select: {
            scopeType: true,
            warehouseId: true,
            role: {
              select: {
                id: true,
                name: true,
                label: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 300,
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("SCM SLA OWNERS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load SLA action owners." },
      { status: 500 },
    );
  }
}
