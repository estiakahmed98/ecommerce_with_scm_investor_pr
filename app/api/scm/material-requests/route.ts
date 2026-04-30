import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateMaterialRequestNumber,
  materialRequestInclude,
  toMaterialRequestLogSnapshot,
} from "@/lib/material-warehouse";

const MATERIAL_REQUEST_READ_PERMISSIONS = [
  "material_requests.read",
  "material_requests.manage",
  "material_requests.endorse_supervisor",
  "material_requests.endorse_project_manager",
  "material_requests.approve_admin",
  "material_releases.read",
  "material_releases.manage",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadMaterialRequests(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...MATERIAL_REQUEST_READ_PERMISSIONS]);
}

function hasGlobalMaterialRequestScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return MATERIAL_REQUEST_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function parseAttachmentRows(raw: unknown) {
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((row, index) => {
      const item = row as {
        fileUrl?: unknown;
        fileName?: unknown;
        mimeType?: unknown;
        fileSize?: unknown;
        note?: unknown;
      };
      const fileUrl = toCleanText(item.fileUrl, 600);
      const fileName = toCleanText(item.fileName, 255);
      if (!fileUrl || !fileName) {
        throw new Error(`Attachment ${index + 1}: file URL and file name are required`);
      }
      if (!fileUrl.startsWith("/api/upload/scm-material/")) {
        throw new Error(`Attachment ${index + 1}: invalid upload scope`);
      }
      const fileSizeRaw =
        item.fileSize === undefined || item.fileSize === null || item.fileSize === ""
          ? null
          : Number(item.fileSize);
      if (fileSizeRaw !== null && (!Number.isInteger(fileSizeRaw) || fileSizeRaw < 0)) {
        throw new Error(`Attachment ${index + 1}: invalid file size`);
      }
      return {
        fileUrl,
        fileName,
        mimeType: toCleanText(item.mimeType, 160) || null,
        fileSize: fileSizeRaw,
        note: toCleanText(item.note, 255) || null,
      };
    })
    .slice(0, 20);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadMaterialRequests(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = toCleanText(request.nextUrl.searchParams.get("status"), 60).toUpperCase();
    const search = toCleanText(request.nextUrl.searchParams.get("search"), 120);
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");

    const where: Prisma.MaterialRequestWhereInput = {};
    if (status) {
      where.status = status as Prisma.EnumMaterialRequestStatusFilter["equals"];
    }
    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: "insensitive" } },
        { warehouse: { name: { contains: search, mode: "insensitive" } } },
        { title: { contains: search, mode: "insensitive" } },
        { purpose: { contains: search, mode: "insensitive" } },
      ];
    }

    const hasGlobalScope = hasGlobalMaterialRequestScope(access);
    if (hasGlobalScope) {
      if (Number.isInteger(warehouseId) && warehouseId > 0) {
        where.warehouseId = warehouseId;
      }
    } else if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json([]);
      }
      where.warehouseId = warehouseId;
    } else if (access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    } else {
      return NextResponse.json([]);
    }

    const requests = await prisma.materialRequest.findMany({
      where,
      include: materialRequestInclude,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("SCM MATERIAL REQUESTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load material requests." },
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

    const body = (await request.json().catch(() => ({}))) as {
      warehouseId?: unknown;
      title?: unknown;
      purpose?: unknown;
      budgetCode?: unknown;
      boqReference?: unknown;
      specification?: unknown;
      note?: unknown;
      requiredBy?: unknown;
      items?: Array<{
        productVariantId?: unknown;
        quantityRequested?: unknown;
        description?: unknown;
      }>;
      attachments?: unknown;
    };

    const warehouseId = Number(body.warehouseId);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
    }
    if (!access.can("material_requests.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = Array.isArray(body.items) ? body.items : [];
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "At least one material request item is required." },
        { status: 400 },
      );
    }

    const normalizedItems = rows.map((item, index) => {
      const productVariantId = Number(item.productVariantId);
      const quantityRequested = Number(item.quantityRequested);
      if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
        throw new Error(`Item ${index + 1}: variant is required`);
      }
      if (!Number.isInteger(quantityRequested) || quantityRequested <= 0) {
        throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
      }
      return {
        productVariantId,
        quantityRequested,
        description: toCleanText(item.description, 255) || null,
      };
    });

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: normalizedItems.map((item) => item.productVariantId) } },
      select: { id: true },
    });
    if (variants.length !== normalizedItems.length) {
      return NextResponse.json(
        { error: "One or more variants were not found." },
        { status: 400 },
      );
    }

    const requiredBy = body.requiredBy ? new Date(String(body.requiredBy)) : null;
    if (requiredBy && Number.isNaN(requiredBy.getTime())) {
      return NextResponse.json({ error: "Required-by date is invalid." }, { status: 400 });
    }

    const attachments = parseAttachmentRows(body.attachments);
    const created = await prisma.$transaction(async (tx) => {
      const requestNumber = await generateMaterialRequestNumber(tx);
      return tx.materialRequest.create({
        data: {
          requestNumber,
          warehouseId,
          title: toCleanText(body.title, 160) || null,
          purpose: toCleanText(body.purpose, 500) || null,
          budgetCode: toCleanText(body.budgetCode, 120) || null,
          boqReference: toCleanText(body.boqReference, 160) || null,
          specification: toCleanText(body.specification, 1200) || null,
          note: toCleanText(body.note, 1000) || null,
          requiredBy,
          createdById: access.userId,
          items: {
            create: normalizedItems,
          },
          attachments: {
            create: attachments.map((attachment) => ({
              ...attachment,
              uploadedById: access.userId,
            })),
          },
        },
        include: materialRequestInclude,
      });
    });

    await logActivity({
      action: "create",
      entity: "material_request",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created material request ${created.requestNumber}`,
      },
      after: toMaterialRequestLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM MATERIAL REQUESTS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create material request." },
      { status: 500 },
    );
  }
}

