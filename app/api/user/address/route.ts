import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAllowedShippingArea, normalizeShippingArea } from "@/lib/shipping-areas";

function normalizeDetails(details: unknown): string {
  // store as JSON array string
  if (Array.isArray(details)) {
    const arr = details
      .map((x) => String(x ?? "").trim())
      .filter((s) => s.length > 0);
    return JSON.stringify(arr);
  }
  if (typeof details === "string") {
    // if already JSON array string, keep
    try {
      const parsed = JSON.parse(details);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch {}
    // fallback: treat as single line
    const line = details.trim();
    return JSON.stringify(line ? [line] : []);
  }
  return JSON.stringify([]);
}

async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!session?.user || !userId) return { userId: null as any };
  return { userId };
}

/**
 * GET -> current user's addresses
 */
export async function GET() {
  const { userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const addresses = await db.userAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      label: true,
      country: true,
      district: true,
      area: true,
      details: true,
      isDefault: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ addresses });
}

/**
 * POST -> create address
 * body: { label, country, district, area, details: string[] | string, isDefault }
 */
export async function POST(req: NextRequest) {
  const { userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const label = String(body.label ?? "").trim();
  const country = String(body.country ?? "").trim();
  const district = String(body.district ?? "").trim();
  const area = String(body.area ?? "").trim();
  const isDefault = !!body.isDefault;
  const detailsStr = normalizeDetails(body.details);

  // Basic validation
  const detailsArr = (() => {
    try {
      const a = JSON.parse(detailsStr);
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  })();

  if (!label || !country || !district || !area || !detailsArr[0]) {
    return NextResponse.json(
      { error: "Missing required fields (label, country, district, area, address1)" },
      { status: 400 }
    );
  }
  if (!isAllowedShippingArea(area)) {
    return NextResponse.json(
      { error: "Invalid area. Allowed: Dhaka, Outside Dhaka, Outside Bangladesh" },
      { status: 400 },
    );
  }
  const canonicalArea = normalizeShippingArea(area)!;

  // if new one is default -> unset others
  if (isDefault) {
    await db.userAddress.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  const created = await db.userAddress.create({
    data: {
      userId,
      label,
      country,
      district,
      area: canonicalArea,
      details: detailsStr,
      isDefault,
    },
    select: {
      id: true,
      label: true,
      country: true,
      district: true,
      area: true,
      details: true,
      isDefault: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ address: created });
}

/**
 * PUT -> update address
 * body: { id, label, country, district, area, details, isDefault }
 */
export async function PUT(req: NextRequest) {
  const { userId } = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const id = Number(body.id);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "Address id is required" }, { status: 400 });
  }

  const existing = await db.userAddress.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }

  const label = String(body.label ?? "").trim();
  const country = String(body.country ?? "").trim();
  const district = String(body.district ?? "").trim();
  const area = String(body.area ?? "").trim();
  const isDefault = !!body.isDefault;
  const detailsStr = normalizeDetails(body.details);

  const detailsArr = (() => {
    try {
      const a = JSON.parse(detailsStr);
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  })();

  if (!label || !country || !district || !area || !detailsArr[0]) {
    return NextResponse.json(
      { error: "Missing required fields (label, country, district, area, address1)" },
      { status: 400 }
    );
  }
  if (!isAllowedShippingArea(area)) {
    return NextResponse.json(
      { error: "Invalid area. Allowed: Dhaka, Outside Dhaka, Outside Bangladesh" },
      { status: 400 },
    );
  }
  const canonicalArea = normalizeShippingArea(area)!;

  // If making default -> unset others in a transaction
  const updated = await db.$transaction(async (tx) => {
    if (isDefault) {
      await tx.userAddress.updateMany({
        where: { userId, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return tx.userAddress.update({
      where: { id },
      data: {
        label,
        country,
        district,
        area: canonicalArea,
        details: detailsStr,
        isDefault,
      },
      select: {
        id: true,
        label: true,
        country: true,
        district: true,
        area: true,
        details: true,
        isDefault: true,
        createdAt: true,
      },
    });
  });

  return NextResponse.json({ address: updated });
}
