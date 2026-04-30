import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

function toCourierLogSnapshot(courier: {
  name: string;
  type: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  secretKey?: string | null;
  clientId?: string | null;
  isActive?: boolean | null;
}) {
  return {
    name: courier.name,
    type: courier.type,
    baseUrl: courier.baseUrl ?? null,
    apiKeyConfigured: Boolean(courier.apiKey),
    secretKeyConfigured: Boolean(courier.secretKey),
    clientId: courier.clientId ?? null,
    isActive: courier.isActive ?? null,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!access.has("settings.courier.manage") && !access.has("settings.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id } = await params;
  const courierId = Number(id);
  if (!courierId || Number.isNaN(courierId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.courier.findUnique({
    where: { id: courierId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Courier not found" }, { status: 404 });
  }

  const courier = await prisma.courier.update({
    where: { id: courierId },
    data: body,
  });

  await logActivity({
    action: "update",
    entity: "courier",
    entityId: courier.id,
    access,
    request: req,
    metadata: {
      message: `Courier updated: ${courier.name} (${courier.type})`,
    },
    before: toCourierLogSnapshot(existing),
    after: toCourierLogSnapshot(courier),
  });

  return NextResponse.json(courier);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!access.has("settings.courier.manage") && !access.has("settings.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const courierId = Number(id);
  if (!courierId || Number.isNaN(courierId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.courier.findUnique({
    where: { id: courierId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Courier not found" }, { status: 404 });
  }

  await prisma.courier.delete({
    where: { id: courierId },
  });

  await logActivity({
    action: "delete",
    entity: "courier",
    entityId: courierId,
    access,
    request: req,
    metadata: {
      message: `Courier deleted: ${existing.name} (${existing.type})`,
    },
    before: toCourierLogSnapshot(existing),
  });

  return NextResponse.json({ success: true });
}
