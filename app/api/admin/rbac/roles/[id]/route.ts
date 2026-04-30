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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const role = await prisma.role.findUnique({
      where: { id },
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

    if (!role || role.deletedAt) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: role.id,
      name: role.name,
      label: role.label,
      description: role.description,
      isSystem: role.isSystem,
      isImmutable: role.isImmutable,
      userCount: role._count.userRoles,
      permissions: role.rolePermissions.map((rp) => rp.permission),
    });
  } catch (error) {
    console.error("RBAC ROLE GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load role." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const existingRole = await prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: {
              select: { key: true },
            },
          },
        },
      },
    });
    if (!existingRole || existingRole.deletedAt) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }
    if (existingRole.isImmutable) {
      return NextResponse.json(
        { error: "Immutable system role cannot be modified." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      label?: unknown;
      description?: unknown;
      permissionKeys?: unknown;
    };
    const label = toCleanText(body.label, 80);
    const description = toCleanText(body.description, 300);
    const permissionKeys = Array.isArray(body.permissionKeys)
      ? body.permissionKeys.filter((key: unknown): key is string => typeof key === "string")
      : null;

    const permissionsToSet = permissionKeys
      ? normalizePermissionKeys(permissionKeys.filter(isPermissionKey))
      : null;
    if (permissionsToSet && permissionsToSet.length === 0) {
      return NextResponse.json(
        { error: "At least one valid permission is required." },
        { status: 400 },
      );
    }

    const updatedRole = await prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id },
        data: {
          label: label || undefined,
          description: description || undefined,
        },
      });

      if (permissionsToSet) {
        const permissionRecords = await tx.permission.findMany({
          where: { key: { in: permissionsToSet } },
          select: { id: true },
        });
        if (permissionRecords.length !== permissionsToSet.length) {
          throw new Error("Some permissions are missing in the database.");
        }

        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionRecords.map((permission) => ({
            roleId: id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      return tx.role.findUnique({
        where: { id },
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
    });

    await logActivity({
      action: "update",
      entity: "rbac_role",
      entityId: id,
      access,
      request,
      metadata: {
        message: `Updated role ${updatedRole?.label ?? updatedRole?.name ?? id}`,
      },
      before: toRoleLogSnapshot(existingRole),
      after: updatedRole ? toRoleLogSnapshot(updatedRole) : null,
    });

    return NextResponse.json({
      id: updatedRole?.id,
      name: updatedRole?.name,
      label: updatedRole?.label,
      description: updatedRole?.description,
      isSystem: updatedRole?.isSystem,
      isImmutable: updatedRole?.isImmutable,
      userCount: updatedRole?._count.userRoles ?? 0,
      permissions: updatedRole?.rolePermissions.map((rp) => rp.permission) ?? [],
    });
  } catch (error) {
    console.error("RBAC ROLE PATCH ERROR:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to update role.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const role = await prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isImmutable: true,
        deletedAt: true,
        _count: { select: { userRoles: true } },
      },
    });

    if (!role || role.deletedAt) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }
    if (role.isImmutable || role.name === "superadmin") {
      return NextResponse.json(
        { error: "Immutable role cannot be deleted." },
        { status: 403 },
      );
    }
    if (role._count.userRoles > 0) {
      return NextResponse.json(
        { error: "Unassign users from role before deletion." },
        { status: 409 },
      );
    }

    await prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logActivity({
      action: "delete",
      entity: "rbac_role",
      entityId: id,
      access,
      request,
      metadata: {
        message: `Deleted role ${role.name}`,
      },
      before: {
        name: role.name,
        isImmutable: role.isImmutable,
        assignedUserCount: role._count.userRoles,
      },
    });

    return NextResponse.json({ message: "Role deleted successfully." });
  } catch (error) {
    console.error("RBAC ROLE DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete role." }, { status: 500 });
  }
}
