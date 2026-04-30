import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { getAccessContext } from "@/lib/rbac";
import { NextResponse } from "next/server";

function toVatRateLogSnapshot(rate: {
  id: number;
  VatClassId: number;
  countryCode: string;
  regionCode: string | null;
  rate: unknown;
  inclusive: boolean;
  startDate: Date | null;
  endDate: Date | null;
}) {
  return {
    id: rate.id,
    VatClassId: rate.VatClassId,
    countryCode: rate.countryCode,
    regionCode: rate.regionCode,
    rate: Number(rate.rate),
    inclusive: rate.inclusive,
    startDate: rate.startDate?.toISOString() ?? null,
    endDate: rate.endDate?.toISOString() ?? null,
  };
}

/* =========================
   GET VAT RATES
   Optional query: ?VatClassId=1
========================= */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const vatClassIdParam = url.searchParams.get("VatClassId");
    const VatClassId = vatClassIdParam ? Number(vatClassIdParam) : null;

    const rates = await prisma.vatRate.findMany({
      where: VatClassId ? { VatClassId } : undefined,
      orderBy: { id: "desc" },
    });

    return NextResponse.json(rates);
  } catch (error) {
    console.error("GET VAT RATES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch vat rates" },
      { status: 500 },
    );
  }
}

/* =========================
   CREATE VAT RATE
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

    const VatClassId = Number(body.VatClassId);
    if (!VatClassId || Number.isNaN(VatClassId)) {
      return NextResponse.json(
        { error: "VatClassId is required" },
        { status: 400 },
      );
    }

    const countryCode = String(body.countryCode || "")
      .trim()
      .toUpperCase();
    if (countryCode.length !== 2) {
      return NextResponse.json(
        { error: "Country code must be 2 letters (e.g. BD)" },
        { status: 400 },
      );
    }

    const regionCode =
      body.regionCode !== undefined && body.regionCode !== null && body.regionCode !== ""
        ? String(body.regionCode).trim().toUpperCase()
        : null;

    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json(
        { error: "Rate must be a number (decimal, e.g. 0.075)" },
        { status: 400 },
      );
    }

    const startDate = body.startDate ? new Date(String(body.startDate)) : null;
    const endDate = body.endDate ? new Date(String(body.endDate)) : null;

    const created = await prisma.vatRate.create({
      data: {
        VatClassId,
        countryCode,
        regionCode,
        rate,
        inclusive: Boolean(body.inclusive),
        startDate,
        endDate,
      },
    });

    await logActivity({
      action: "create_vat_rate",
      entity: "vat_rate",
      entityId: created.id,
      access,
      request: req,
      metadata: {
        message: `VAT rate created for ${created.countryCode}${created.regionCode ? `-${created.regionCode}` : ""}`,
      },
      after: toVatRateLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST VAT RATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create vat rate" },
      { status: 500 },
    );
  }
}

