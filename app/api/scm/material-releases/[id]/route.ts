import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { materialReleaseInclude } from "@/lib/material-warehouse";

const MATERIAL_RELEASE_READ_PERMISSIONS = [
  "material_releases.read",
  "material_releases.manage",
  "material_requests.read",
  "material_requests.manage",
  "material_requests.approve_admin",
] as const;

function canReadMaterialReleases(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...MATERIAL_RELEASE_READ_PERMISSIONS]);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const materialReleaseId = Number(id);
    if (!Number.isInteger(materialReleaseId) || materialReleaseId <= 0) {
      return NextResponse.json({ error: "Invalid material release id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadMaterialReleases(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const release = await prisma.materialReleaseNote.findUnique({
      where: { id: materialReleaseId },
      include: materialReleaseInclude,
    });
    if (!release) {
      return NextResponse.json({ error: "Material release not found." }, { status: 404 });
    }
    if (!access.canAccessWarehouse(release.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(release);
  } catch (error) {
    console.error("SCM MATERIAL RELEASE GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load material release." },
      { status: 500 },
    );
  }
}
