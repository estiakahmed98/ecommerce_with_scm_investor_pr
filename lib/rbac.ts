import { prisma } from "@/lib/prisma";
import {
  getAllPermissionKeys,
  isPermissionKey,
  LEGACY_ROLE_FALLBACKS,
  type PermissionKey,
} from "@/lib/rbac-config";

type SessionUser = {
  id?: string;
  role?: string;
} | null | undefined;

type ScopeType = "GLOBAL" | "WAREHOUSE";

type WarehouseSummary = {
  id: number;
  name: string;
  code: string;
  isDefault: boolean;
  isPrimary: boolean;
  status: string;
};

type ScopedRoleAssignment = {
  id: string;
  roleId: string;
  roleName: string;
  roleLabel: string;
  scopeType: ScopeType;
  warehouseId: number | null;
};

export type AccessContext = {
  userId: string | null;
  legacyRole: string | null;
  roleNames: string[];
  permissions: PermissionKey[];
  globalPermissions: PermissionKey[];
  warehouseIds: number[];
  primaryWarehouseId: number | null;
  warehouseMemberships: WarehouseSummary[];
  scopedRoleAssignments: ScopedRoleAssignment[];
  defaultAdminRoute: "/admin" | "/admin/warehouse";
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  has: (permission: PermissionKey) => boolean;
  hasAny: (permissions: PermissionKey[]) => boolean;
  hasGlobal: (permission: PermissionKey) => boolean;
  can: (permission: PermissionKey, warehouseId?: number | null) => boolean;
  canAccessWarehouse: (warehouseId: number | null | undefined) => boolean;
};

function normalizeRoleName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getLegacyFallbackPermissions(legacyRole: string | null): PermissionKey[] {
  if (!legacyRole) return [];
  const normalized = legacyRole.toLowerCase();
  // Keep legacy fallback only for storefront users; staff access must come from RBAC role assignments.
  if (normalized !== "user") {
    return [];
  }
  const direct = LEGACY_ROLE_FALLBACKS[normalized];
  return direct ? [...direct] : [];
}

function dedupePermissions(rawKeys: string[]): PermissionKey[] {
  const unique = new Set<PermissionKey>();
  for (const raw of rawKeys) {
    if (isPermissionKey(raw)) {
      unique.add(raw);
    }
  }
  return [...unique];
}

function dedupeWarehouseIds(rawIds: Array<number | null | undefined>): number[] {
  const unique = new Set<number>();
  for (const value of rawIds) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      unique.add(value);
    }
  }
  return [...unique].sort((left, right) => left - right);
}

const WAREHOUSE_DASHBOARD_PERMISSIONS: PermissionKey[] = [
  "dashboard.read",
  "inventory.manage",
  "orders.read_all",
  "shipments.manage",
];

async function getUserAccessProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      userRoles: {
        where: { role: { deletedAt: null } },
        select: {
          id: true,
          roleId: true,
          scopeType: true,
          warehouseId: true,
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
              isDefault: true,
            },
          },
          role: {
            select: {
              name: true,
              label: true,
              rolePermissions: {
                select: {
                  permission: {
                    select: {
                      key: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      warehouseMemberships: {
        where: { status: "ACTIVE" },
        select: {
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
        orderBy: [{ isPrimary: "desc" }, { warehouseId: "asc" }],
      },
    },
  });
}

function buildAccessContext(
  userId: string | null,
  sessionLegacyRole: string | null,
  profile: Awaited<ReturnType<typeof getUserAccessProfile>>,
): AccessContext {
  const dbLegacyRole = normalizeRoleName(profile?.role);
  const effectiveLegacyRole = dbLegacyRole ?? sessionLegacyRole;

  if (!userId || !profile) {
    return {
      userId: null,
      legacyRole: effectiveLegacyRole,
      roleNames: [],
      permissions: [],
      globalPermissions: [],
      warehouseIds: [],
      primaryWarehouseId: null,
      warehouseMemberships: [],
      scopedRoleAssignments: [],
      defaultAdminRoute: "/admin",
      isAuthenticated: false,
      isSuperAdmin: false,
      has: () => false,
      hasAny: () => false,
      hasGlobal: () => false,
      can: () => false,
      canAccessWarehouse: () => false,
    };
  }

  const scopedRoleAssignments: ScopedRoleAssignment[] = profile.userRoles.map((item) => ({
    id: item.id,
    roleId: item.roleId,
    roleName: item.role.name,
    roleLabel: item.role.label,
    scopeType: item.scopeType,
    warehouseId: item.warehouseId ?? null,
  }));

  const roleNames = [...new Set(profile.userRoles.map((item) => item.role.name.toLowerCase()))];
  const isSuperAdmin = roleNames.includes("superadmin");

  const globalRawKeys = profile.userRoles
    .filter((item) => item.scopeType === "GLOBAL")
    .flatMap((item) => item.role.rolePermissions.map((rp) => rp.permission.key));

  const scopedPermissionMap = new Map<number, Set<PermissionKey>>();
  for (const item of profile.userRoles) {
    if (item.scopeType !== "WAREHOUSE" || !item.warehouseId) {
      continue;
    }

    const existing = scopedPermissionMap.get(item.warehouseId) ?? new Set<PermissionKey>();
    for (const rolePermission of item.role.rolePermissions) {
      const permissionKey = rolePermission.permission.key;
      if (isPermissionKey(permissionKey)) {
        existing.add(permissionKey);
      }
    }
    scopedPermissionMap.set(item.warehouseId, existing);
  }

  const scopedRawKeys = [...scopedPermissionMap.values()].flatMap((permissions) => [...permissions]);
  const fallbackKeys =
    globalRawKeys.length === 0 && scopedRawKeys.length === 0
      ? getLegacyFallbackPermissions(effectiveLegacyRole)
      : [];

  const globalPermissions = dedupePermissions(
    isSuperAdmin ? getAllPermissionKeys() : [...globalRawKeys, ...fallbackKeys],
  );
  const permissions = dedupePermissions(
    isSuperAdmin ? getAllPermissionKeys() : [...globalPermissions, ...scopedRawKeys],
  );

  const permissionSet = new Set<PermissionKey>(permissions);
  const globalPermissionSet = new Set<PermissionKey>(globalPermissions);
  const warehouseMembershipsById = new Map<number, WarehouseSummary>();

  for (const membership of profile.warehouseMemberships) {
    warehouseMembershipsById.set(membership.warehouse.id, {
      id: membership.warehouse.id,
      name: membership.warehouse.name,
      code: membership.warehouse.code,
      isDefault: membership.warehouse.isDefault,
      isPrimary: membership.isPrimary,
      status: membership.status,
    });
  }

  for (const item of profile.userRoles) {
    if (!item.warehouseId || !item.warehouse) {
      continue;
    }

    if (!warehouseMembershipsById.has(item.warehouseId)) {
      warehouseMembershipsById.set(item.warehouseId, {
        id: item.warehouse.id,
        name: item.warehouse.name,
        code: item.warehouse.code,
        isDefault: item.warehouse.isDefault,
        isPrimary: false,
        status: "ACTIVE",
      });
    }
  }

  const warehouseMemberships = [...warehouseMembershipsById.values()].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return left.id - right.id;
  });

  const warehouseIds = dedupeWarehouseIds([
    ...warehouseMemberships.map((membership) => membership.id),
    ...profile.userRoles.map((item) => item.warehouseId),
  ]);
  const primaryWarehouseId =
    warehouseMemberships.find((membership) => membership.isPrimary)?.id ??
    warehouseMemberships[0]?.id ??
    null;

  const hasGlobalAdminScope = globalPermissionSet.has("admin.panel.access");
  const hasWarehouseAdminScope = warehouseIds.some((warehouseId) => {
    const permissionKeys = scopedPermissionMap.get(warehouseId);
    if (!permissionKeys) return false;
    return permissionKeys.has("admin.panel.access");
  });
  const hasWarehouseDashboardScope = warehouseIds.some((warehouseId) => {
    const permissionKeys = scopedPermissionMap.get(warehouseId);
    if (!permissionKeys) return false;
    return WAREHOUSE_DASHBOARD_PERMISSIONS.some((permission) => permissionKeys.has(permission));
  });

  return {
    userId,
    legacyRole: effectiveLegacyRole,
    roleNames,
    permissions,
    globalPermissions,
    warehouseIds,
    primaryWarehouseId,
    warehouseMemberships,
    scopedRoleAssignments,
    defaultAdminRoute:
      !hasGlobalAdminScope && hasWarehouseAdminScope && hasWarehouseDashboardScope
        ? "/admin/warehouse"
        : "/admin",
    isAuthenticated: true,
    isSuperAdmin,
    has: (permission) => permissionSet.has(permission),
    hasAny: (required) => required.some((permission) => permissionSet.has(permission)),
    hasGlobal: (permission) => isSuperAdmin || globalPermissionSet.has(permission),
    can: (permission, warehouseId) => {
      if (isSuperAdmin || globalPermissionSet.has(permission)) {
        return true;
      }
      if (warehouseId === null || warehouseId === undefined) {
        return [...scopedPermissionMap.values()].some((keys) => keys.has(permission));
      }
      return scopedPermissionMap.get(warehouseId)?.has(permission) ?? false;
    },
    canAccessWarehouse: (warehouseId) => {
      if (isSuperAdmin) return true;
      if (warehouseId === null || warehouseId === undefined) return false;
      return warehouseIds.includes(warehouseId);
    },
  };
}

export async function getUserPermissionKeys(userId: string): Promise<PermissionKey[]> {
  const profile = await getUserAccessProfile(userId);
  return buildAccessContext(userId, normalizeRoleName(profile?.role), profile).permissions;
}

export async function getAccessContext(sessionUser: SessionUser): Promise<AccessContext> {
  const userId = typeof sessionUser?.id === "string" ? sessionUser.id : null;
  const legacyRole = normalizeRoleName(sessionUser?.role);

  if (!userId) {
    return buildAccessContext(null, legacyRole, null);
  }

  const profile = await getUserAccessProfile(userId);
  return buildAccessContext(userId, legacyRole, profile);
}

export function hasPermissionKey(
  permissionKeys: string[] | null | undefined,
  permission: PermissionKey,
): boolean {
  if (!Array.isArray(permissionKeys)) return false;
  return permissionKeys.includes(permission);
}
