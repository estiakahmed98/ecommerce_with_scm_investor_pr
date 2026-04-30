import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

type MembershipInput = {
  warehouseId: number;
  isPrimary?: boolean;
};

type WarehouseRoleInput = {
  warehouseId: number;
  roleIds: string[];
};

function resolveLegacyRoleName(params: {
  globalRoleIds: string[];
  scopedRoles: Array<{ warehouseId: number; roleId: string }>;
  memberships: Array<{ warehouseId: number; isPrimary: boolean }>;
  validRoleMap: Map<string, { id: string; name: string }>;
}): string {
  const { globalRoleIds, scopedRoles, memberships, validRoleMap } = params;

  const globalRoleName = globalRoleIds
    .map((roleId) => validRoleMap.get(roleId)?.name ?? null)
    .find((roleName): roleName is string => Boolean(roleName));
  if (globalRoleName) {
    return globalRoleName;
  }

  const primaryWarehouseId =
    memberships.find((membership) => membership.isPrimary)?.warehouseId ??
    memberships[0]?.warehouseId ??
    null;

  const primaryScopedRole =
    scopedRoles.find((assignment) => assignment.warehouseId === primaryWarehouseId) ??
    scopedRoles[0] ??
    null;

  if (primaryScopedRole) {
    return validRoleMap.get(primaryScopedRole.roleId)?.name ?? "user";
  }

  return "user";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("users.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await params;
    const hasGlobalUserManage = access.hasGlobal("users.manage");

    const [user, warehouses, roles] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          warehouseMemberships: {
            orderBy: [{ isPrimary: "desc" }, { warehouseId: "asc" }],
            select: {
              warehouseId: true,
              isPrimary: true,
              status: true,
              warehouse: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  isDefault: true,
                },
              },
            },
          },
          userRoles: {
            where: { role: { deletedAt: null } },
            orderBy: [{ scopeType: "asc" }, { warehouseId: "asc" }, { role: { name: "asc" } }],
            select: {
              id: true,
              roleId: true,
              scopeType: true,
              warehouseId: true,
              role: {
                select: {
                  id: true,
                  name: true,
                  label: true,
                  description: true,
                  isSystem: true,
                  isImmutable: true,
                },
              },
            },
          },
        },
      }),
      prisma.warehouse.findMany({
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          isDefault: true,
        },
      }),
      prisma.role.findMany({
        where: { deletedAt: null },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          label: true,
          description: true,
          isSystem: true,
          isImmutable: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (!hasGlobalUserManage) {
      const hasSharedWarehouse = user.warehouseMemberships.some((membership) =>
        access.warehouseIds.includes(membership.warehouseId),
      );
      if (!hasSharedWarehouse) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      warehouses: hasGlobalUserManage
        ? warehouses
        : warehouses.filter((warehouse) => access.warehouseIds.includes(warehouse.id)),
      roles,
      memberships: user.warehouseMemberships.map((membership) => ({
        warehouseId: membership.warehouseId,
        isPrimary: membership.isPrimary,
        status: membership.status,
        warehouse: membership.warehouse,
      })),
      globalRoleIds: user.userRoles
        .filter((assignment) => assignment.scopeType === "GLOBAL")
        .map((assignment) => assignment.roleId),
      warehouseRoleAssignments: user.userRoles
        .filter((assignment) => assignment.scopeType === "WAREHOUSE" && assignment.warehouseId)
        .reduce<Array<{ warehouseId: number; roleIds: string[] }>>((acc, assignment) => {
          const existing = acc.find((item) => item.warehouseId === assignment.warehouseId);
          if (existing) {
            existing.roleIds.push(assignment.roleId);
            return acc;
          }
          acc.push({
            warehouseId: assignment.warehouseId as number,
            roleIds: [assignment.roleId],
          });
          return acc;
        }, []),
    });
  } catch (error) {
    console.error("WAREHOUSE ACCESS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load warehouse access." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("users.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: userId } = await params;
    const hasGlobalUserManage = access.hasGlobal("users.manage");
    const body = (await request.json().catch(() => ({}))) as {
      memberships?: MembershipInput[];
      globalRoleIds?: string[];
      warehouseRoleAssignments?: WarehouseRoleInput[];
    };

    const memberships = Array.isArray(body.memberships)
      ? body.memberships
          .map((item) => ({
            warehouseId: Number(item.warehouseId),
            isPrimary: Boolean(item.isPrimary),
          }))
          .filter((item) => Number.isInteger(item.warehouseId) && item.warehouseId > 0)
      : [];

    const globalRoleIds = Array.isArray(body.globalRoleIds)
      ? [...new Set(body.globalRoleIds.filter((value): value is string => typeof value === "string"))]
      : [];

    const warehouseRoleAssignments = Array.isArray(body.warehouseRoleAssignments)
      ? body.warehouseRoleAssignments
          .map((assignment) => ({
            warehouseId: Number(assignment.warehouseId),
            roleIds: Array.isArray(assignment.roleIds)
              ? [
                  ...new Set(
                    assignment.roleIds.filter((value): value is string => typeof value === "string"),
                  ),
                ]
              : [],
          }))
          .filter(
            (assignment) =>
              Number.isInteger(assignment.warehouseId) && assignment.warehouseId > 0,
          )
      : [];

    const uniqueMembershipWarehouseIds = [...new Set(memberships.map((item) => item.warehouseId))];
    const warehouseScopedRoleIds = warehouseRoleAssignments.flatMap((assignment) => assignment.roleIds);
    const allRoleIds = [...new Set([...globalRoleIds, ...warehouseScopedRoleIds])];
    const allWarehouseIds = [
      ...new Set([
        ...uniqueMembershipWarehouseIds,
        ...warehouseRoleAssignments.map((assignment) => assignment.warehouseId),
      ]),
    ];

    const [user, validRoles, validWarehouses] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      }),
      prisma.role.findMany({
        where: {
          id: { in: allRoleIds },
          deletedAt: null,
        },
        select: { id: true, name: true },
      }),
      prisma.warehouse.findMany({
        where: { id: { in: allWarehouseIds } },
        select: { id: true },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (validRoles.length !== allRoleIds.length) {
      return NextResponse.json({ error: "One or more roles are invalid." }, { status: 400 });
    }
    if (validWarehouses.length !== allWarehouseIds.length) {
      return NextResponse.json({ error: "One or more warehouses are invalid." }, { status: 400 });
    }
    if (!hasGlobalUserManage) {
      if (globalRoleIds.length > 0) {
        return NextResponse.json(
          { error: "Warehouse-scoped managers cannot assign global roles." },
          { status: 403 },
        );
      }
      const outsideScope = allWarehouseIds.some((warehouseId) => !access.warehouseIds.includes(warehouseId));
      if (outsideScope) {
        return NextResponse.json(
          { error: "You can only manage users inside your assigned warehouses." },
          { status: 403 },
        );
      }

      const existingSharedMembership = await prisma.warehouseMembership.findFirst({
        where: {
          userId,
          warehouseId: { in: access.warehouseIds },
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (!existingSharedMembership && allWarehouseIds.length > 0) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const validRoleMap = new Map(validRoles.map((role) => [role.id, role]));
    const scopedSuperAdmin = warehouseRoleAssignments.some((assignment) =>
      assignment.roleIds.some((roleId) => validRoleMap.get(roleId)?.name === "superadmin"),
    );
    if (scopedSuperAdmin) {
      return NextResponse.json(
        { error: "Superadmin role cannot be assigned with warehouse scope." },
        { status: 400 },
      );
    }

    const globalSuperAdmin = globalRoleIds.some((roleId) => validRoleMap.get(roleId)?.name === "superadmin");
    if (globalSuperAdmin && !access.roleNames.includes("superadmin")) {
      return NextResponse.json(
        { error: "Only superadmin can assign the superadmin role." },
        { status: 403 },
      );
    }

    const membershipWarehouseSet = new Set(uniqueMembershipWarehouseIds);
    const hasInvalidScopedAssignment = warehouseRoleAssignments.some(
      (assignment) => !membershipWarehouseSet.has(assignment.warehouseId),
    );
    if (hasInvalidScopedAssignment) {
      return NextResponse.json(
        { error: "Warehouse-scoped roles require an active membership for the same warehouse." },
        { status: 400 },
      );
    }

    const nextMemberships =
      memberships.length > 0
        ? memberships.map((membership, index) => ({
            warehouseId: membership.warehouseId,
            isPrimary: membership.isPrimary || (index === 0 && !memberships.some((item) => item.isPrimary)),
          }))
        : [];

    const nextScopedRoles = warehouseRoleAssignments.flatMap((assignment) =>
      assignment.roleIds.map((roleId) => ({
        roleId,
        warehouseId: assignment.warehouseId,
      })),
    );
    const nextLegacyRole = resolveLegacyRoleName({
      globalRoleIds,
      scopedRoles: nextScopedRoles,
      memberships: nextMemberships,
      validRoleMap,
    });

    await prisma.$transaction(async (tx) => {
      const existingMemberships = await tx.warehouseMembership.findMany({
        where: { userId },
        select: { id: true, warehouseId: true },
      });
      const existingGlobalRoles = await tx.userRole.findMany({
        where: { userId, scopeType: "GLOBAL" },
        select: { id: true, roleId: true },
      });
      const existingScopedRoles = await tx.userRole.findMany({
        where: { userId, scopeType: "WAREHOUSE" },
        select: { id: true, roleId: true, warehouseId: true },
      });

      const membershipIdsToKeep = new Set(nextMemberships.map((membership) => membership.warehouseId));
      const membershipIdsToDelete = existingMemberships
        .filter((membership) => !membershipIdsToKeep.has(membership.warehouseId))
        .map((membership) => membership.id);

      if (membershipIdsToDelete.length > 0) {
        await tx.warehouseMembership.deleteMany({
          where: { id: { in: membershipIdsToDelete } },
        });
      }

      for (const membership of nextMemberships) {
        await tx.warehouseMembership.upsert({
          where: {
            userId_warehouseId: {
              userId,
              warehouseId: membership.warehouseId,
            },
          },
          update: {
            isPrimary: membership.isPrimary,
            status: "ACTIVE",
            assignedById: access.userId,
          },
          create: {
            userId,
            warehouseId: membership.warehouseId,
            isPrimary: membership.isPrimary,
            status: "ACTIVE",
            assignedById: access.userId,
          },
        });
      }

      const nextGlobalRoleIds = new Set(globalRoleIds);
      const globalRoleIdsToDelete = existingGlobalRoles
        .filter((assignment) => !nextGlobalRoleIds.has(assignment.roleId))
        .map((assignment) => assignment.id);

      if (globalRoleIdsToDelete.length > 0) {
        await tx.userRole.deleteMany({
          where: { id: { in: globalRoleIdsToDelete } },
        });
      }

      for (const roleId of globalRoleIds) {
        const existing = existingGlobalRoles.find((assignment) => assignment.roleId === roleId);
        if (existing) continue;

        await tx.userRole.create({
          data: {
            userId,
            roleId,
            scopeType: "GLOBAL",
            assignedById: access.userId,
          },
        });
      }

      const nextScopedRoleKeys = new Set(
        nextScopedRoles.map((assignment) => `${assignment.warehouseId}:${assignment.roleId}`),
      );
      const scopedRoleIdsToDelete = existingScopedRoles
        .filter((assignment) => !nextScopedRoleKeys.has(`${assignment.warehouseId}:${assignment.roleId}`))
        .map((assignment) => assignment.id);

      if (scopedRoleIdsToDelete.length > 0) {
        await tx.userRole.deleteMany({
          where: { id: { in: scopedRoleIdsToDelete } },
        });
      }

      for (const assignment of nextScopedRoles) {
        const alreadyExists = existingScopedRoles.some(
          (existing) =>
            existing.roleId === assignment.roleId &&
            existing.warehouseId === assignment.warehouseId,
        );
        if (alreadyExists) continue;

        await tx.userRole.create({
          data: {
            userId,
            roleId: assignment.roleId,
            scopeType: "WAREHOUSE",
            warehouseId: assignment.warehouseId,
            assignedById: access.userId,
          },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          role: nextLegacyRole,
        },
      });
    });

    return NextResponse.json({ message: "Warehouse access updated successfully." });
  } catch (error) {
    console.error("WAREHOUSE ACCESS PUT ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update warehouse access." },
      { status: 500 },
    );
  }
}
