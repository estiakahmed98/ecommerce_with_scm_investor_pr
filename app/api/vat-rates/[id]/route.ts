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
   UPDATE VAT RATE
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();

    const existing = await prisma.vatRate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "VAT rate not found" }, { status: 404 });
    }

    const countryCode =
      body.countryCode !== undefined
        ? String(body.countryCode).trim().toUpperCase()
        : existing.countryCode;

    if (countryCode.length !== 2) {
      return NextResponse.json(
        { error: "Country code must be 2 letters (e.g. BD)" },
        { status: 400 },
      );
    }

    const regionCode =
      body.regionCode !== undefined
        ? body.regionCode
          ? String(body.regionCode).trim().toUpperCase()
          : null
        : existing.regionCode;

    const rate =
      body.rate !== undefined ? Number(body.rate) : Number(existing.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json(
        { error: "Rate must be a number (decimal, e.g. 0.075)" },
        { status: 400 },
      );
    }

    const startDate =
      body.startDate !== undefined
        ? body.startDate
          ? new Date(String(body.startDate))
          : null
        : existing.startDate;

    const endDate =
      body.endDate !== undefined
        ? body.endDate
          ? new Date(String(body.endDate))
          : null
        : existing.endDate;

    const inclusive =
      body.inclusive !== undefined ? Boolean(body.inclusive) : existing.inclusive;

    const updated = await prisma.vatRate.update({
      where: { id },
      data: {
        countryCode,
        regionCode,
        rate,
        inclusive,
        startDate,
        endDate,
      },
    });

    await logActivity({
      action: "update_vat_rate",
      entity: "vat_rate",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: `VAT rate updated for ${updated.countryCode}${updated.regionCode ? `-${updated.regionCode}` : ""}`,
      },
      before: toVatRateLogSnapshot(existing),
      after: toVatRateLogSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT VAT RATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update vat rate" },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE VAT RATE
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.vatRate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "VAT rate not found" }, { status: 404 });
    }

    await prisma.vatRate.delete({ where: { id } });

    await logActivity({
      action: "delete_vat_rate",
      entity: "vat_rate",
      entityId: existing.id,
      access,
      request: req,
      metadata: {
        message: `VAT rate deleted for ${existing.countryCode}${existing.regionCode ? `-${existing.regionCode}` : ""}`,
      },
      before: toVatRateLogSnapshot(existing),
    });

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE VAT RATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete vat rate" },
      { status: 500 },
    );
  }
}

