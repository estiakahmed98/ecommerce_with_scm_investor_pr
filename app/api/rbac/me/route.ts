import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      userId: access.userId,
      legacyRole: access.legacyRole,
      roleNames: access.roleNames,
      permissions: access.permissions,
      globalPermissions: access.globalPermissions,
      warehouseIds: access.warehouseIds,
      primaryWarehouseId: access.primaryWarehouseId,
      warehouseMemberships: access.warehouseMemberships,
      defaultAdminRoute: access.defaultAdminRoute,
      isSuperAdmin: access.isSuperAdmin,
    });
  } catch (error) {
    console.error("RBAC ME ERROR:", error);
    return NextResponse.json({ error: "Failed to load RBAC profile." }, { status: 500 });
  }
}
