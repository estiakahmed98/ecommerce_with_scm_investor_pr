import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  isPermissionKey,
} from "@/lib/rbac-config";

function toCleanText(value: unknown, max = 120): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeRoleName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
}

function normalizePermissionKeys(rawKeys: string[]): string[] {
  return [...new Set(rawKeys)];
}

function toRoleLogSnapshot(role: {
  name: string;
  label: string;
  description?: string | null;
  isSystem?: boolean;
  isImmutable?: boolean;
  rolePermissions?: Array<{
    permission: {
      key: string;
    };
  }>;
}) {
  return {
    name: role.name,
    label: role.label,
    description: role.description ?? null,
    isSystem: role.isSystem ?? null,
    isImmutable: role.isImmutable ?? null,
    permissionKeys: (role.rolePermissions ?? []).map((item) => item.permission.key).sort(),
  };
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
    if (!access.has("roles.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const roles = await prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: { id: true, key: true, description: true },
            },
          },
        },
        _count: {
          select: { userRoles: true },
        },
      },
    });

    return NextResponse.json(
      roles.map((role) => ({
        id: role.id,
        name: role.name,
        label: role.label,
        description: role.description,
        isSystem: role.isSystem,
        isImmutable: role.isImmutable,
        userCount: role._count.userRoles,
        permissions: role.rolePermissions.map((rp) => rp.permission),
      })),
    );
  } catch (error) {
    console.error("RBAC ROLES GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load roles." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      label?: unknown;
      description?: unknown;
      permissionKeys?: unknown;
    };
    const name = normalizeRoleName(body.name);
    const label = toCleanText(body.label, 80);
    const description = toCleanText(body.description, 300);
    const permissionKeys = Array.isArray(body.permissionKeys)
      ? body.permissionKeys.filter((key: unknown): key is string => typeof key === "string")
      : [];

    if (!name || !label) {
      return NextResponse.json(
        { error: "Role name and label are required." },
        { status: 400 },
      );
    }

    const validPermissionKeys = normalizePermissionKeys(permissionKeys.filter(isPermissionKey));
    if (validPermissionKeys.length === 0) {
      return NextResponse.json(
        { error: "At least one valid permission is required." },
        { status: 400 },
      );
    }

    const existing = await prisma.role.findUnique({
      where: { name },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      return NextResponse.json({ error: "Role name already exists." }, { status: 409 });
    }

    const permissions = await prisma.permission.findMany({
      where: { key: { in: validPermissionKeys } },
      select: { id: true },
    });
    if (permissions.length !== validPermissionKeys.length) {
      return NextResponse.json(
        { error: "One or more permissions do not exist in database." },
        { status: 400 },
      );
    }

    const role = await prisma.role.create({
      data: {
        name,
        label,
        description: description || null,
        isSystem: false,
        isImmutable: false,
        rolePermissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: { id: true, key: true, description: true },
            },
          },
        },
      },
    });

    await logActivity({
      action: "create",
      entity: "rbac_role",
      entityId: role.id,
      access,
      request,
      metadata: {
        message: `Created role ${role.label} (${role.name})`,
      },
      after: toRoleLogSnapshot(role),
    });

    return NextResponse.json(
      {
        id: role.id,
        name: role.name,
        label: role.label,
        description: role.description,
        isSystem: role.isSystem,
        isImmutable: role.isImmutable,
        permissions: role.rolePermissions.map((rp) => rp.permission),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("RBAC ROLES POST ERROR:", error);
    return NextResponse.json({ error: "Failed to create role." }, { status: 500 });
  }
}
