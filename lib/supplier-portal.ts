import type { AccessContext } from "@/lib/rbac";
import { getAccessContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type SessionUser = {
  id?: string;
  role?: string;
} | null | undefined;

export const SUPPLIER_PORTAL_PERMISSION = "supplier.portal.access" as const;

export type SupplierPortalContext = {
  access: AccessContext;
  supplierPortalAccessId: string;
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  userId: string;
};

export type SupplierPortalResolution =
  | { ok: true; context: SupplierPortalContext }
  | { ok: false; status: 401 | 403; error: string; access: AccessContext };

export async function resolveSupplierPortalContext(
  sessionUser: SessionUser,
): Promise<SupplierPortalResolution> {
  const access = await getAccessContext(
    sessionUser as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    return { ok: false, status: 401, error: "Unauthorized", access };
  }

  if (!access.has(SUPPLIER_PORTAL_PERMISSION)) {
    return {
      ok: false,
      status: 403,
      error: "Supplier portal permission is missing for this account.",
      access,
    };
  }

  const portalAccess = await prisma.supplierPortalAccess.findFirst({
    where: {
      userId: access.userId,
      status: "ACTIVE",
      supplier: { isActive: true },
    },
    select: {
      id: true,
      supplier: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!portalAccess) {
    return {
      ok: false,
      status: 403,
      error:
        "Supplier portal is not configured for this user. Ask an administrator to assign supplier portal access.",
      access,
    };
  }

  return {
    ok: true,
    context: {
      access,
      supplierPortalAccessId: portalAccess.id,
      supplierId: portalAccess.supplier.id,
      supplierCode: portalAccess.supplier.code,
      supplierName: portalAccess.supplier.name,
      userId: access.userId,
    },
  };
}
