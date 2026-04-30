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
   GET VAT Management
========================= */
export async function GET() {
  try {
    const vatClasses = await prisma.vatClass.findMany({
      orderBy: { id: "desc" },
      include: {
        rates: {
          orderBy: { id: "desc" },
        },
      },
    });

    return NextResponse.json(vatClasses);
  } catch (error) {
    console.error("GET VAT CLASS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch VAT Management" },
      { status: 500 }
    );
  }
}

/* =========================
   CREATE VAT CLASS
========================= */
export async function POST(req: Request) {
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

    const body = await req.json();

    if (!body.name || !body.code) {
      return NextResponse.json(
        { error: "Name and Code are required" },
        { status: 400 }
      );
    }

    const code = String(body.code).trim();

    // Check duplicate code
    const exists = await prisma.vatClass.findUnique({
      where: { code },
    });

    if (exists) {
      return NextResponse.json(
        { error: "VAT code already exists" },
        { status: 400 }
      );
    }

    const vatClass = await prisma.vatClass.create({
      data: {
        name: String(body.name).trim(),
        code,
        description: body.description || null,
      },
    });

    await logActivity({
      action: "create_vat_class",
      entity: "vat_class",
      entityId: vatClass.id,
      access,
      request: req,
      metadata: {
        message: `VAT class created: ${vatClass.name} (${vatClass.code})`,
      },
      after: toVatClassLogSnapshot(vatClass),
    });

    return NextResponse.json(vatClass);
  } catch (error) {
    console.error("POST VAT CLASS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create vat class" },
      { status: 500 }
    );
  }
}
