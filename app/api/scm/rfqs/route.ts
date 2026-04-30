import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { createRfqNotifications, dispatchRfqEmailNotifications } from "@/lib/rfq-notifications";
import { generateRfqNumber, rfqInclude, toRfqLogSnapshot } from "@/lib/scm";

const RFQ_READ_PERMISSIONS = ["rfq.read", "rfq.manage", "rfq.approve"] as const;

type RfqItemInput = {
  productVariantId?: unknown;
  quantityRequested?: unknown;
  description?: unknown;
  targetUnitCost?: unknown;
};

type RfqAttachmentInput = {
  fileUrl?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSize?: unknown;
  label?: unknown;
};

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanCurrency(value: unknown, fallback = "BDT") {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : fallback;
  return raw.length === 3 ? raw : fallback;
}

function canReadRfqs(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...RFQ_READ_PERMISSIONS]);
}

function hasGlobalRfqScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return RFQ_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function buildWarehouseScopedWhere(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  requestedWarehouseId: number | null,
): Prisma.RfqWhereInput | null {
  if (hasGlobalRfqScope(access)) {
    return requestedWarehouseId ? { warehouseId: requestedWarehouseId } : {};
  }

  if (requestedWarehouseId) {
    if (!access.canAccessWarehouse(requestedWarehouseId)) {
      return null;
    }
    return { warehouseId: requestedWarehouseId };
  }

  if (access.warehouseIds.length === 0) {
    return null;
  }

  return { warehouseId: { in: access.warehouseIds } };
}

function parsePositiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<number>();
  for (const item of value) {
    const id = Number(item);
    if (Number.isInteger(id) && id > 0) {
      deduped.add(id);
    }
  }
  return [...deduped];
}

function normalizeRfqItems(items: RfqItemInput[]) {
  const uniqueVariantIds = new Set<number>();

  return items.map((item, index) => {
    const productVariantId = Number(item.productVariantId);
    const quantityRequested = Number(item.quantityRequested);

    if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
      throw new Error(`Item ${index + 1}: variant is required`);
    }
    if (uniqueVariantIds.has(productVariantId)) {
      throw new Error(`Item ${index + 1}: duplicate variant selected`);
    }
    uniqueVariantIds.add(productVariantId);

    if (!Number.isInteger(quantityRequested) || quantityRequested <= 0) {
      throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
    }

    const targetUnitCostRaw = item.targetUnitCost;
    const targetUnitCost =
      targetUnitCostRaw === null ||
      targetUnitCostRaw === undefined ||
      targetUnitCostRaw === ""
        ? null
        : new Prisma.Decimal(Number(targetUnitCostRaw));
    if (targetUnitCost && targetUnitCost.lt(0)) {
      throw new Error(`Item ${index + 1}: target unit cost cannot be negative`);
    }

    return {
      productVariantId,
      quantityRequested,
      description: cleanText(item.description, 255),
      targetUnitCost,
    };
  });
}

function normalizeRfqAttachments(attachments: unknown): Array<{
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  label: string | null;
}> {
  if (!Array.isArray(attachments)) return [];

  const normalized = attachments.map((attachment, index) => {
    const item =
      attachment && typeof attachment === "object"
        ? (attachment as RfqAttachmentInput)
        : null;
    const fileUrl = cleanText(item?.fileUrl, 1000);
    if (!fileUrl) {
      throw new Error(`Attachment ${index + 1}: file URL is required.`);
    }

    const fileSizeRaw = item?.fileSize;
    const fileSize =
      fileSizeRaw === null || fileSizeRaw === undefined || fileSizeRaw === ""
        ? null
        : Number(fileSizeRaw);
    if (fileSize !== null && (!Number.isInteger(fileSize) || fileSize < 0)) {
      throw new Error(`Attachment ${index + 1}: file size is invalid.`);
    }

    return {
      fileUrl,
      fileName: cleanText(item?.fileName, 255) || null,
      mimeType: cleanText(item?.mimeType, 120) || null,
      fileSize,
      label: cleanText(item?.label, 120) || null,
    };
  });

  const seen = new Set<string>();
  for (const attachment of normalized) {
    const dedupeKey = `${attachment.fileUrl}|${attachment.fileName ?? ""}`;
    if (seen.has(dedupeKey)) {
      throw new Error("Duplicate RFQ attachment detected.");
    }
    seen.add(dedupeKey);
  }

  return normalized;
}

function isBlindReviewActive(rfq: {
  status: string;
  submissionDeadline: Date | null;
}) {
  if (!rfq.submissionDeadline) return false;
  if (rfq.status === "DRAFT" || rfq.status === "CANCELLED") return false;
  return Date.now() < rfq.submissionDeadline.getTime();
}

function toAdminRfqView<T extends { status: string; submissionDeadline: Date | null; quotations: unknown[] }>(
  rfq: T,
) {
  const quotationSubmissionCount = rfq.quotations.length;
  if (!isBlindReviewActive(rfq)) {
    return {
      ...rfq,
      isBlindReviewActive: false,
      quotationSubmissionCount,
      quotationsVisibleAt: rfq.submissionDeadline?.toISOString() ?? null,
    };
  }
  const supplierInvites = Array.isArray((rfq as any).supplierInvites)
    ? (rfq as any).supplierInvites.map((invite: any) => ({
        ...invite,
        status: invite.status === "AWARDED" ? "AWARDED" : "INVITED",
        respondedAt: null,
        resubmissionRequestedAt: null,
        resubmissionReason: null,
      }))
    : (rfq as any).supplierInvites;
  return {
    ...rfq,
    quotations: [] as unknown[],
    supplierInvites,
    isBlindReviewActive: true,
    quotationSubmissionCount,
    quotationsVisibleAt: rfq.submissionDeadline?.toISOString() ?? null,
  };
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
    if (!canReadRfqs(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const warehouseFilter = buildWarehouseScopedWhere(
      access,
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
    );
    if (warehouseFilter === null) {
      return NextResponse.json([]);
    }

    const filters: Prisma.RfqWhereInput[] = [warehouseFilter];
    if (status) {
      filters.push({
        status: status as Prisma.EnumRfqStatusFilter["equals"],
      });
    }
    if (search) {
      filters.push({
        OR: [
          {
            rfqNumber: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            warehouse: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
          {
            supplierInvites: {
              some: {
                supplier: {
                  name: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
          {
            categoryTargets: {
              some: {
                supplierCategory: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { code: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    const rfqs = await prisma.rfq.findMany({
      where: filters.length === 1 ? filters[0] : { AND: filters },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      include: rfqInclude,
    });

    return NextResponse.json(rfqs.map((rfq) => toAdminRfqView(rfq)));
  } catch (error) {
    console.error("SCM RFQ GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load RFQs." }, { status: 500 });
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
      purchaseRequisitionId?: unknown;
      submissionDeadline?: unknown;
      note?: unknown;
      currency?: unknown;
      scopeOfWork?: unknown;
      termsAndConditions?: unknown;
      boqDetails?: unknown;
      technicalSpecifications?: unknown;
      evaluationCriteria?: unknown;
      supplierIds?: unknown[];
      categoryIds?: unknown[];
      resubmissionAllowed?: unknown;
      attachments?: unknown;
      items?: RfqItemInput[];
    };

    const warehouseId = Number(body.warehouseId);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
    }
    if (!access.can("rfq.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const purchaseRequisitionId = Number(body.purchaseRequisitionId);
    const hasPurchaseRequisition =
      Number.isInteger(purchaseRequisitionId) && purchaseRequisitionId > 0;

    const payloadItems = Array.isArray(body.items) ? body.items : [];
    const categoryIds = parsePositiveIds(body.categoryIds);
    const explicitSupplierIds = parsePositiveIds(body.supplierIds);
    const normalizedAttachments = normalizeRfqAttachments(body.attachments);

    const [warehouse, requisition, categories] = await Promise.all([
      prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, name: true, code: true },
      }),
      hasPurchaseRequisition
        ? prisma.purchaseRequisition.findUnique({
            where: { id: purchaseRequisitionId },
            select: {
              id: true,
              requisitionNumber: true,
              status: true,
              warehouseId: true,
              title: true,
              purpose: true,
              budgetCode: true,
              boqReference: true,
              specification: true,
              planningNote: true,
              estimatedAmount: true,
              note: true,
              items: {
                orderBy: { id: "asc" },
                select: {
                  id: true,
                  productVariantId: true,
                  quantityRequested: true,
                  quantityApproved: true,
                  description: true,
                },
              },
              attachments: {
                orderBy: { id: "asc" },
                select: {
                  id: true,
                  fileUrl: true,
                  fileName: true,
                  mimeType: true,
                  fileSize: true,
                  note: true,
                },
              },
            },
          })
        : Promise.resolve(null),
      categoryIds.length > 0
        ? prisma.supplierCategory.findMany({
            where: {
              id: { in: categoryIds },
              isActive: true,
            },
            select: {
              id: true,
              code: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    ]);

    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
    }
    if (categoryIds.length > 0 && categories.length !== categoryIds.length) {
      return NextResponse.json(
        { error: "One or more supplier categories are invalid or inactive." },
        { status: 400 },
      );
    }
    if (categoryIds.length === 0) {
      return NextResponse.json(
        { error: "At least one supplier category is required for a new RFQ." },
        { status: 400 },
      );
    }

    if (hasPurchaseRequisition) {
      if (!requisition) {
        return NextResponse.json(
          { error: "Linked purchase requisition not found." },
          { status: 404 },
        );
      }
      if (requisition.warehouseId !== warehouseId) {
        return NextResponse.json(
          { error: "RFQ warehouse must match linked purchase requisition warehouse." },
          { status: 400 },
        );
      }
      if (!["APPROVED", "CONVERTED"].includes(requisition.status)) {
        return NextResponse.json(
          {
            error:
              "Only approved/converted purchase requisitions can be linked to a new RFQ.",
          },
          { status: 400 },
        );
      }
    }

    const normalizedItems =
      payloadItems.length > 0
        ? normalizeRfqItems(payloadItems)
        : requisition
          ? normalizeRfqItems(
              requisition.items.map((item) => ({
                productVariantId: item.productVariantId,
                quantityRequested:
                  item.quantityApproved && item.quantityApproved > 0
                    ? item.quantityApproved
                    : item.quantityRequested,
                description: item.description,
                targetUnitCost: "",
              })),
            )
          : [];

    if (normalizedItems.length === 0) {
      return NextResponse.json(
        { error: "At least one RFQ item is required." },
        { status: 400 },
      );
    }

    const [variants, selectedSuppliers] = await Promise.all([
      prisma.productVariant.findMany({
        where: {
          id: { in: normalizedItems.map((item) => item.productVariantId) },
        },
        select: {
          id: true,
          sku: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      }),
      explicitSupplierIds.length > 0
        ? prisma.supplier.findMany({
            where: {
              id: { in: explicitSupplierIds },
              isActive: true,
              ...(categoryIds.length > 0
                ? {
                    categories: {
                      some: {
                        supplierCategoryId: { in: categoryIds },
                      },
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              name: true,
              code: true,
              email: true,
            },
          })
        : Promise.resolve([]),
    ]);

    if (variants.length !== normalizedItems.length) {
      return NextResponse.json(
        { error: "One or more variants were not found." },
        { status: 400 },
      );
    }
    if (selectedSuppliers.length !== explicitSupplierIds.length) {
      return NextResponse.json(
        {
          error:
            "One or more selected suppliers are not active or outside selected categories.",
        },
        { status: 400 },
      );
    }

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const submissionDeadline = body.submissionDeadline
      ? new Date(String(body.submissionDeadline))
      : null;
    if (submissionDeadline && Number.isNaN(submissionDeadline.getTime())) {
      return NextResponse.json(
        { error: "Submission deadline date is invalid." },
        { status: 400 },
      );
    }

    const derivedAttachments =
      normalizedAttachments.length > 0
        ? normalizedAttachments
        : requisition
          ? requisition.attachments.map((attachment) => ({
              fileUrl: attachment.fileUrl,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              fileSize: attachment.fileSize,
              label: attachment.note
                ? `MRF: ${attachment.note}`
                : "MRF supporting document",
            }))
          : [];

    const sourceRequisitionSnapshot = requisition
      ? {
          id: requisition.id,
          requisitionNumber: requisition.requisitionNumber,
          status: requisition.status,
          title: requisition.title,
          purpose: requisition.purpose,
          budgetCode: requisition.budgetCode,
          boqReference: requisition.boqReference,
          specification: requisition.specification,
          planningNote: requisition.planningNote,
          estimatedAmount: requisition.estimatedAmount?.toString() ?? null,
          note: requisition.note,
          attachments: requisition.attachments.map((attachment) => ({
            id: attachment.id,
            fileUrl: attachment.fileUrl,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSize,
            note: attachment.note,
          })),
        }
      : null;
    const { created } = await prisma.$transaction(async (tx) => {
      const rfqNumber = await generateRfqNumber(tx);
      const createdRfq = await tx.rfq.create({
        data: {
          rfqNumber,
          warehouseId,
          purchaseRequisitionId: hasPurchaseRequisition ? purchaseRequisitionId : null,
          submissionDeadline,
          note: cleanText(body.note, 1500) || null,
          currency: cleanCurrency(body.currency),
          scopeOfWork:
            cleanText(body.scopeOfWork, 4000) ||
            cleanText(requisition?.purpose, 4000) ||
            null,
          termsAndConditions: cleanText(body.termsAndConditions, 4000) || null,
          boqDetails:
            cleanText(body.boqDetails, 4000) ||
            cleanText(requisition?.boqReference, 4000) ||
            null,
          technicalSpecifications:
            cleanText(body.technicalSpecifications, 4000) ||
            cleanText(requisition?.specification, 4000) ||
            null,
          evaluationCriteria:
            cleanText(body.evaluationCriteria, 4000) ||
            "Technical compliance, lead time, pricing, service capability",
          resubmissionAllowed:
            body.resubmissionAllowed === undefined
              ? true
              : Boolean(body.resubmissionAllowed),
          sourceRequisitionSnapshot: sourceRequisitionSnapshot
            ? (sourceRequisitionSnapshot as Prisma.InputJsonValue)
            : undefined,
          createdById: access.userId,
          items: {
            create: normalizedItems.map((item) => ({
              productVariantId: item.productVariantId,
              quantityRequested: item.quantityRequested,
              description:
                item.description ||
                `${variantMap.get(item.productVariantId)?.product.name ?? "Variant"} (${variantMap.get(item.productVariantId)?.sku ?? "SKU"})`,
              targetUnitCost: item.targetUnitCost,
            })),
          },
          attachments:
            derivedAttachments.length > 0
              ? {
                  create: derivedAttachments.map((attachment) => ({
                    label: attachment.label,
                    fileUrl: attachment.fileUrl,
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType,
                    fileSize: attachment.fileSize,
                    uploadedById: access.userId,
                  })),
                }
              : undefined,
          categoryTargets:
            categories.length > 0
              ? {
                  create: categories.map((category) => ({
                    supplierCategoryId: category.id,
                    createdById: access.userId,
                  })),
                }
              : undefined,
          supplierInvites:
            explicitSupplierIds.length > 0
              ? {
                  create: explicitSupplierIds.map((supplierId) => ({
                    supplierId,
                    status: "INVITED",
                    note: "Manually invited during RFQ draft creation.",
                    lastNotifiedAt: new Date(),
                    createdById: access.userId,
                  })),
                }
              : undefined,
        },
        include: rfqInclude,
      });
      return { created: createdRfq };
    });

    await logActivity({
      action: "create",
      entity: "rfq",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created RFQ ${created.rfqNumber}`,
        linkedPurchaseRequisitionId: hasPurchaseRequisition
          ? purchaseRequisitionId
          : null,
        supplierInviteCount: created.supplierInvites.length,
        supplierCategoryCount: created.categoryTargets.length,
        inviteMode:
          created.supplierInvites.length > 0
            ? "manual_during_draft_creation"
            : "category_targeting_only",
      },
      after: toRfqLogSnapshot(created),
    });

    return NextResponse.json(toAdminRfqView(created), { status: 201 });
  } catch (error: any) {
    console.error("SCM RFQ POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create RFQ." },
      { status: 500 },
    );
  }
}
