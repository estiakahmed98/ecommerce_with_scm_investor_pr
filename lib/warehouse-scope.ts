import type { AccessContext } from "@/lib/rbac";
import type { PermissionKey } from "@/lib/rbac-config";

export type WarehouseScope =
  | { mode: "all"; warehouseIds: [] }
  | { mode: "assigned"; warehouseIds: number[] }
  | { mode: "none"; warehouseIds: [] };

export function isWarehouseScopedOnly(access: AccessContext): boolean {
  return access.defaultAdminRoute === "/admin/warehouse" && access.warehouseIds.length > 0;
}

export function resolveWarehouseScope(
  access: AccessContext,
  permission: PermissionKey,
  requestedWarehouseId?: number | null,
): WarehouseScope {
  if (access.isSuperAdmin || access.hasGlobal(permission)) {
    if (
      requestedWarehouseId &&
      Number.isInteger(requestedWarehouseId) &&
      requestedWarehouseId > 0
    ) {
      return { mode: "assigned", warehouseIds: [requestedWarehouseId] };
    }
    return { mode: "all", warehouseIds: [] };
  }

  const permittedWarehouseIds = access.warehouseIds.filter((warehouseId) =>
    access.can(permission, warehouseId),
  );

  if (requestedWarehouseId && Number.isInteger(requestedWarehouseId) && requestedWarehouseId > 0) {
    if (permittedWarehouseIds.includes(requestedWarehouseId)) {
      return { mode: "assigned", warehouseIds: [requestedWarehouseId] };
    }
    return { mode: "none", warehouseIds: [] };
  }

  if (permittedWarehouseIds.length === 0) {
    return { mode: "none", warehouseIds: [] };
  }

  return { mode: "assigned", warehouseIds: permittedWarehouseIds };
}

export function canAccessWarehouseWithPermission(
  access: AccessContext,
  permission: PermissionKey,
  warehouseId?: number | null,
): boolean {
  if (!warehouseId || Number.isNaN(warehouseId)) {
    return access.hasGlobal(permission) || access.can(permission);
  }

  if (access.isSuperAdmin || access.hasGlobal(permission)) {
    return true;
  }

  return access.canAccessWarehouse(warehouseId) && access.can(permission, warehouseId);
}
