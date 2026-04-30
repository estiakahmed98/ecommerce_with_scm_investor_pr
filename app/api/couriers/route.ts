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

export async function GET() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!access.hasAny(["settings.courier.manage", "settings.manage", "shipments.manage"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const couriers = await prisma.courier.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(couriers);
}

export async function POST(req: NextRequest) {
  try {
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

    const courier = await prisma.courier.create({
      data: {
        name: body.name,
        type: body.type,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey,
        secretKey: body.secretKey,
        clientId: body.clientId,
        isActive: body.isActive ?? true,
      },
    });

    await logActivity({
      action: "create",
      entity: "courier",
      entityId: courier.id,
      access,
      request: req,
      metadata: {
        message: `Courier created: ${courier.name} (${courier.type})`,
      },
      after: toCourierLogSnapshot(courier),
    });

    return NextResponse.json(courier, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create courier" },
      { status: 500 }
    );
  }
}
