import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { ensureDefaultPurchaseOrderTermsTemplates } from "@/lib/purchase-order-terms";

const READ_PERMISSIONS = [
  "purchase_orders.read",
  "purchase_orders.manage",
  "purchase_orders.approve",
  "purchase_orders.approve_manager",
  "purchase_orders.approve_committee",
  "purchase_orders.approve_final",
] as const;

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...READ_PERMISSIONS]);
}

function canManageTemplates(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("purchase_orders.manage") || access.hasGlobal("settings.manage");
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
    if (!canRead(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await prisma.$transaction(async (tx) => {
      await ensureDefaultPurchaseOrderTermsTemplates(tx, access.userId);
      return tx.purchaseOrderTermsTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          body: true,
          isDefault: true,
          isActive: true,
        },
      });
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("SCM PO TERMS TEMPLATE GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load PO terms templates." },
      { status: 500 },
    );
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
    if (!canManageTemplates(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      code?: unknown;
      name?: unknown;
      body?: unknown;
      isDefault?: unknown;
      isActive?: unknown;
    };

    const code = cleanText(body.code, 60).toUpperCase().replace(/\s+/g, "_");
    const name = cleanText(body.name, 140);
    const templateBody = cleanText(body.body, 7000);
    if (!code || !name || !templateBody) {
      return NextResponse.json(
        { error: "Code, name, and body are required." },
        { status: 400 },
      );
    }

    const isDefault = Boolean(body.isDefault);
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);

    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.purchaseOrderTermsTemplate.updateMany({
          where: { isDefault: true },
          data: { isDefault: false, updatedById: access.userId },
        });
      }
      return tx.purchaseOrderTermsTemplate.create({
        data: {
          code,
          name,
          body: templateBody,
          isDefault,
          isActive,
          createdById: access.userId,
          updatedById: access.userId,
        },
        select: {
          id: true,
          code: true,
          name: true,
          body: true,
          isDefault: true,
          isActive: true,
        },
      });
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM PO TERMS TEMPLATE POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create PO terms template." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageTemplates(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      code?: unknown;
      name?: unknown;
      body?: unknown;
      isDefault?: unknown;
      isActive?: unknown;
    };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Template id is required." }, { status: 400 });
    }

    const data: Record<string, unknown> = {
      updatedById: access.userId,
    };

    if (body.code !== undefined) {
      const code = cleanText(body.code, 60).toUpperCase().replace(/\s+/g, "_");
      if (!code) {
        return NextResponse.json({ error: "Template code is invalid." }, { status: 400 });
      }
      data.code = code;
    }
    if (body.name !== undefined) {
      const name = cleanText(body.name, 140);
      if (!name) {
        return NextResponse.json({ error: "Template name is invalid." }, { status: 400 });
      }
      data.name = name;
    }
    if (body.body !== undefined) {
      const templateBody = cleanText(body.body, 7000);
      if (!templateBody) {
        return NextResponse.json({ error: "Template body is invalid." }, { status: 400 });
      }
      data.body = templateBody;
    }
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    const isDefault =
      body.isDefault === undefined ? null : Boolean(body.isDefault);

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.purchaseOrderTermsTemplate.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false, updatedById: access.userId },
        });
      }
      return tx.purchaseOrderTermsTemplate.update({
        where: { id },
        data: {
          ...data,
          ...(isDefault !== null ? { isDefault } : {}),
        },
        select: {
          id: true,
          code: true,
          name: true,
          body: true,
          isDefault: true,
          isActive: true,
        },
      });
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("SCM PO TERMS TEMPLATE PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update PO terms template." },
      { status: 500 },
    );
  }
}
