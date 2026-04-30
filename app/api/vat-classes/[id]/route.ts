import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { getAccessContext } from "@/lib/rbac";
import { NextResponse } from "next/server";

function toVatClassLogSnapshot(vatClass: {
  id: number;
  name: string;
  code: string;
  description: string | null;
}) {
  return {
    id: vatClass.id,
    name: vatClass.name,
    code: vatClass.code,
    description: vatClass.description,
  };
}

/* =========================
   UPDATE VAT CLASS
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny(["settings.vat.manage", "settings.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const id = Number(idParam);
    const body = await req.json();

    const existing = await prisma.vatClass.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "VAT class not found" },
        { status: 404 }
      );
    }

    // If code changed, check duplicate
    if (body.code && body.code !== existing.code) {
      const duplicate = await prisma.vatClass.findUnique({
        where: { code: body.code },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "VAT code already exists" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.vatClass.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code,
        description: body.description,
      },
    });

    await logActivity({
      action: "update_vat_class",
      entity: "vat_class",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: `VAT class updated: ${updated.name} (${updated.code})`,
      },
      before: toVatClassLogSnapshot(existing),
      after: toVatClassLogSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT VAT CLASS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update vat class" },
      { status: 500 }
    );
  }
}

/* =========================
   DELETE VAT CLASS
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny(["settings.vat.manage", "settings.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const id = Number(idParam);
    const existing = await prisma.vatClass.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "VAT class not found" }, { status: 404 });
    }

    await prisma.vatRate.deleteMany({
      where: { VatClassId: id },
    });

    await prisma.vatClass.delete({
      where: { id },
    });

    await logActivity({
      action: "delete_vat_class",
      entity: "vat_class",
      entityId: existing.id,
      access,
      request: req,
      metadata: {
        message: `VAT class deleted: ${existing.name} (${existing.code})`,
      },
      before: toVatClassLogSnapshot(existing),
    });

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE VAT CLASS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete vat class" },
      { status: 500 }
    );
  }
}
