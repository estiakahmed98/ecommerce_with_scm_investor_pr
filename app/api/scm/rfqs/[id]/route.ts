import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { createRfqNotifications, dispatchRfqEmailNotifications } from "@/lib/rfq-notifications";
import {
  computePurchaseOrderTotals,
  generatePurchaseOrderNumber,
  purchaseOrderInclude,
  rfqInclude,
  toDecimalAmount,
  toPurchaseOrderLogSnapshot,
  toRfqLogSnapshot,
} from "@/lib/scm";

const rfqDetailInclude = {
  ...rfqInclude,
  comparativeStatements: {
    orderBy: [{ id: "desc" as const }],
    select: {
      id: true,
      csNumber: true,
      status: true,
      generatedPurchaseOrder: {
        select: {
          id: true,
          poNumber: true,
          status: true,
          goodsReceipts: {
            orderBy: [{ receivedAt: "desc" as const }],
            select: {
              id: true,
              receiptNumber: true,
              status: true,
            },
          },
          supplierInvoices: {
            orderBy: [{ issueDate: "desc" as const }, { id: "desc" as const }],
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
            },
          },
          paymentRequests: {
            orderBy: [{ requestedAt: "desc" as const }, { id: "desc" as const }],
            select: {
              id: true,
              prfNumber: true,
              status: true,
              supplierPayment: {
                select: {
                  id: true,
                  paymentNumber: true,
                  amount: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RfqInclude;

const RFQ_READ_PERMISSIONS = ["rfq.read", "rfq.manage", "rfq.approve"] as const;

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanCurrency(value: unknown, fallback = "BDT") {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : fallback;
  return raw.length === 3 ? raw : fallback;
}

function parsePositiveIds(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  const deduped = new Set<number>();
  for (const item of value) {
    const id = Number(item);
    if (Number.isInteger(id) && id > 0) {
      deduped.add(id);
    }
  }
  return [...deduped];
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
        ? (attachment as Record<string, unknown>)
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

function canReadRfqs(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...RFQ_READ_PERMISSIONS]);
}

function hasGlobalRfqScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return RFQ_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function canAccessRfq(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  rfq: { warehouseId: number },
) {
  return hasGlobalRfqScope(access) || access.canAccessWarehouse(rfq.warehouseId);
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isInteger(rfqId) || rfqId <= 0) {
      return NextResponse.json({ error: "Invalid RFQ id." }, { status: 400 });
    }

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

    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      include: rfqDetailInclude,
    });
    if (!rfq) {
      return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
    }
    if (!canAccessRfq(access, rfq)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(toAdminRfqView(rfq));
  } catch (error) {
    console.error("SCM RFQ GET BY ID ERROR:", error);
    return NextResponse.json({ error: "Failed to load RFQ." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rfqId = Number(id);
    if (!Number.isInteger(rfqId) || rfqId <= 0) {
      return NextResponse.json({ error: "Invalid RFQ id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      include: rfqInclude,
    });
    if (!rfq) {
      return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
    }
    if (!canAccessRfq(access, rfq)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      submissionDeadline?: unknown;
      note?: unknown;
      currency?: unknown;
      scopeOfWork?: unknown;
      termsAndConditions?: unknown;
      boqDetails?: unknown;
      technicalSpecifications?: unknown;
      evaluationCriteria?: unknown;
      resubmissionAllowed?: unknown;
      resubmissionReason?: unknown;
      categoryIds?: unknown[];
      attachments?: unknown;
      supplierIds?: unknown[];
      supplierId?: unknown;
      quotationId?: unknown;
      validUntil?: unknown;
      quotationNote?: unknown;
      taxTotal?: unknown;
      items?: Array<{
        rfqItemId?: unknown;
        quantityQuoted?: unknown;
        unitCost?: unknown;
        description?: unknown;
      }>;
    };
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const before = toRfqLogSnapshot(rfq);

    if (!action) {
      if (!access.can("rfq.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (rfq.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft RFQs can be edited." },
          { status: 400 },
        );
      }

      const submissionDeadline = body.submissionDeadline
        ? new Date(String(body.submissionDeadline))
        : null;
      if (submissionDeadline && Number.isNaN(submissionDeadline.getTime())) {
        return NextResponse.json(
          { error: "Submission deadline is invalid." },
          { status: 400 },
        );
      }

      const categoryIds =
        body.categoryIds === undefined ? null : parsePositiveIds(body.categoryIds);
      const attachments =
        body.attachments === undefined
          ? null
          : normalizeRfqAttachments(body.attachments);

      if (categoryIds !== null) {
        const categories =
          categoryIds.length > 0
            ? await prisma.supplierCategory.findMany({
                where: {
                  id: { in: categoryIds },
                  isActive: true,
                },
                select: { id: true },
              })
            : [];
        if (categories.length !== categoryIds.length) {
          return NextResponse.json(
            { error: "One or more supplier categories are invalid or inactive." },
            { status: 400 },
          );
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const data: Prisma.RfqUpdateInput = {
          submissionDeadline,
          note: cleanText(body.note, 1500) || null,
          currency: cleanCurrency(body.currency, rfq.currency),
          scopeOfWork: cleanText(body.scopeOfWork, 4000) || null,
          termsAndConditions: cleanText(body.termsAndConditions, 4000) || null,
          boqDetails: cleanText(body.boqDetails, 4000) || null,
          technicalSpecifications: cleanText(body.technicalSpecifications, 4000) || null,
          evaluationCriteria: cleanText(body.evaluationCriteria, 4000) || null,
        };

        if (body.resubmissionAllowed !== undefined) {
          data.resubmissionAllowed = Boolean(body.resubmissionAllowed);
        }
        if (categoryIds !== null) {
          data.categoryTargets = {
            deleteMany: {},
            ...(categoryIds.length > 0
              ? {
                  create: categoryIds.map((supplierCategoryId) => ({
                    supplierCategoryId,
                    createdById: access.userId,
                  })),
                }
              : {}),
          };
        }
        if (attachments !== null) {
          data.attachments = {
            deleteMany: {},
            ...(attachments.length > 0
              ? {
                  create: attachments.map((attachment) => ({
                    label: attachment.label,
                    fileUrl: attachment.fileUrl,
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType,
                    fileSize: attachment.fileSize,
                    uploadedById: access.userId,
                  })),
                }
              : {}),
          };
        }

        return tx.rfq.update({
          where: { id: rfq.id },
          data,
          include: rfqInclude,
        });
      });

      await logActivity({
        action: "update",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Updated RFQ ${updated.rfqNumber}` },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "submit") {
      if (!access.can("rfq.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (rfq.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft RFQs can be submitted." },
          { status: 400 },
        );
      }
      if (rfq.items.length === 0) {
        return NextResponse.json(
          { error: "RFQ must include at least one line item before submit." },
          { status: 400 },
        );
      }
      if (rfq.supplierInvites.length === 0) {
        return NextResponse.json(
          { error: "Invite at least one supplier before submitting RFQ." },
          { status: 400 },
        );
      }
      if (!rfq.submissionDeadline) {
        return NextResponse.json(
          {
            error:
              "Submission deadline is required for enterprise blind-review RFQ submission.",
          },
          { status: 400 },
        );
      }

      const updated = await prisma.rfq.update({
        where: { id: rfq.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          cancelledAt: null,
        },
        include: rfqInclude,
      });

      await logActivity({
        action: "submit",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Submitted RFQ ${updated.rfqNumber}` },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "close") {
      if (!access.can("rfq.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["SUBMITTED", "AWARDED"].includes(rfq.status)) {
        return NextResponse.json(
          { error: "Only submitted/awarded RFQs can be closed." },
          { status: 400 },
        );
      }

      const updated = await prisma.rfq.update({
        where: { id: rfq.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
        },
        include: rfqInclude,
      });

      await logActivity({
        action: "close",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Closed RFQ ${updated.rfqNumber}` },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "cancel") {
      if (!access.can("rfq.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED", "CLOSED"].includes(rfq.status)) {
        return NextResponse.json(
          { error: "This RFQ can no longer be cancelled." },
          { status: 400 },
        );
      }

      const updated = await prisma.rfq.update({
        where: { id: rfq.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
        include: rfqInclude,
      });

      await logActivity({
        action: "cancel",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: { message: `Cancelled RFQ ${updated.rfqNumber}` },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "invite_suppliers") {
      if (!access.can("rfq.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED"].includes(rfq.status)) {
        return NextResponse.json(
          { error: "Suppliers can only be invited on draft/submitted RFQs." },
          { status: 400 },
        );
      }

      const supplierIds = parsePositiveIds(body.supplierIds);
      const categoryIdsFromBody =
        body.categoryIds === undefined ? null : parsePositiveIds(body.categoryIds);
      const categoryIds =
        categoryIdsFromBody === null
          ? rfq.categoryTargets.map((target) => target.supplierCategoryId)
          : categoryIdsFromBody;

      if (categoryIds.length > 0) {
        const categories = await prisma.supplierCategory.findMany({
          where: {
            id: { in: categoryIds },
            isActive: true,
          },
          select: { id: true },
        });
        if (categories.length !== categoryIds.length) {
          return NextResponse.json(
            { error: "One or more supplier categories are invalid or inactive." },
            { status: 400 },
          );
        }
      }

      const targetSupplierIds =
        supplierIds.length > 0
          ? supplierIds
          : categoryIds.length > 0
            ? (
                await prisma.supplier.findMany({
                  where: {
                    isActive: true,
                    categories: {
                      some: {
                        supplierCategoryId: {
                          in: categoryIds,
                        },
                      },
                    },
                  },
                  select: { id: true },
                })
              ).map((supplier) => supplier.id)
            : [];
      if (targetSupplierIds.length === 0) {
        return NextResponse.json(
          {
            error:
              "Select suppliers directly or provide supplier categories with active suppliers.",
          },
          { status: 400 },
        );
      }

      const suppliers = await prisma.supplier.findMany({
        where: {
          id: { in: targetSupplierIds },
          isActive: true,
          ...(categoryIds.length > 0
            ? {
                categories: {
                  some: {
                    supplierCategoryId: {
                      in: categoryIds,
                    },
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          email: true,
        },
      });
      if (suppliers.length !== targetSupplierIds.length) {
        return NextResponse.json(
          {
            error:
              "One or more selected suppliers are inactive or outside the selected categories.",
          },
          { status: 400 },
        );
      }

      const inviteNote = cleanText(body.note, 500) || null;
      const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        if (categoryIdsFromBody !== null) {
          await tx.rfqCategoryTarget.deleteMany({
            where: { rfqId: rfq.id },
          });
          if (categoryIds.length > 0) {
            await tx.rfqCategoryTarget.createMany({
              data: categoryIds.map((supplierCategoryId) => ({
                rfqId: rfq.id,
                supplierCategoryId,
                createdById: access.userId,
              })),
              skipDuplicates: true,
            });
          }
        }

        for (const supplierId of targetSupplierIds) {
          await tx.rfqSupplierInvite.upsert({
            where: {
              rfqId_supplierId: {
                rfqId: rfq.id,
                supplierId,
              },
            },
            create: {
              rfqId: rfq.id,
              supplierId,
              status: "INVITED",
              note: inviteNote,
              lastNotifiedAt: new Date(),
              createdById: access.userId,
            },
            update: {
              status: "INVITED",
              invitedAt: new Date(),
              respondedAt: null,
              lastNotifiedAt: new Date(),
              resubmissionRequestedAt: null,
              resubmissionReason: null,
              note: inviteNote,
              createdById: access.userId,
            },
          });
        }

        const invites = await tx.rfqSupplierInvite.findMany({
          where: {
            rfqId: rfq.id,
            supplierId: { in: targetSupplierIds },
          },
          select: {
            id: true,
            supplierId: true,
          },
        });

        const emailIds = await createRfqNotifications({
          tx,
          rfqId: rfq.id,
          recipients: invites.map((invite) => ({
            inviteId: invite.id,
            supplierId: invite.supplierId,
            recipientEmail: supplierMap.get(invite.supplierId)?.email ?? null,
          })),
          message:
            `You have been invited to RFQ ${rfq.rfqNumber}.` +
            (rfq.submissionDeadline
              ? ` Submission deadline: ${rfq.submissionDeadline.toISOString()}.`
              : ""),
          metadata: {
            stage: "INVITED",
            rfqNumber: rfq.rfqNumber,
            categoryIds,
          },
          createdById: access.userId,
        });

        const next = await tx.rfq.findUnique({
          where: { id: rfq.id },
          include: rfqInclude,
        });
        if (!next) {
          throw new Error("RFQ lookup failed after supplier invite");
        }

        return {
          updated: next,
          emailNotificationIds: emailIds,
        };
      });

      void dispatchRfqEmailNotifications(emailNotificationIds);
      if (!updated) {
        throw new Error("RFQ lookup failed after supplier invite");
      }

      await logActivity({
        action: "invite_suppliers",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Invited ${targetSupplierIds.length} supplier(s) to RFQ ${updated.rfqNumber}`,
          supplierIds: targetSupplierIds,
          categoryIds,
        },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "submit_quotation") {
      if (!access.can("rfq.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (isBlindReviewActive(rfq)) {
        return NextResponse.json(
          {
            error:
              "Blind review is active until the RFQ deadline. Manual quotation entry is locked.",
          },
          { status: 400 },
        );
      }
      if (!["SUBMITTED", "CLOSED", "AWARDED"].includes(rfq.status)) {
        return NextResponse.json(
          { error: "Quotations can only be submitted on submitted/closed RFQs." },
          { status: 400 },
        );
      }

      const supplierId = Number(body.supplierId);
      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
      }
      const targetedCategoryIds = rfq.categoryTargets.map(
        (target) => target.supplierCategoryId,
      );
      const supplier = await prisma.supplier.findFirst({
        where: {
          id: supplierId,
          isActive: true,
          ...(targetedCategoryIds.length > 0
            ? {
                categories: {
                  some: {
                    supplierCategoryId: { in: targetedCategoryIds },
                  },
                },
              }
            : {}),
        },
        select: { id: true, currency: true },
      });
      if (!supplier) {
        return NextResponse.json(
          {
            error:
              targetedCategoryIds.length > 0
                ? "Supplier is outside RFQ targeted categories."
                : "Supplier not found or inactive.",
          },
          { status: 404 },
        );
      }

      const linesRaw = Array.isArray(body.items) ? body.items : [];
      if (linesRaw.length === 0) {
        return NextResponse.json(
          { error: "At least one quotation line is required." },
          { status: 400 },
        );
      }

      const rfqItemMap = new Map(rfq.items.map((item) => [item.id, item]));
      const seenRfqItemIds = new Set<number>();
      const quotationItems = linesRaw.map((line, index) => {
        const rfqItemId = Number(line.rfqItemId);
        if (!Number.isInteger(rfqItemId) || rfqItemId <= 0) {
          throw new Error(`Quotation line ${index + 1}: rfq item is required`);
        }
        if (seenRfqItemIds.has(rfqItemId)) {
          throw new Error(`Quotation line ${index + 1}: duplicate RFQ item selected`);
        }
        seenRfqItemIds.add(rfqItemId);

        const rfqItem = rfqItemMap.get(rfqItemId);
        if (!rfqItem) {
          throw new Error(`Quotation line ${index + 1}: RFQ item not found`);
        }

        const quantityQuoted = Number(line.quantityQuoted);
        if (!Number.isInteger(quantityQuoted) || quantityQuoted <= 0) {
          throw new Error(`Quotation line ${index + 1}: quoted quantity must be greater than 0`);
        }
        const unitCost = toDecimalAmount(line.unitCost, `Unit cost for line ${index + 1}`);
        const lineTotal = unitCost.mul(quantityQuoted);

        return {
          rfqItemId,
          productVariantId: rfqItem.productVariantId,
          quantityQuoted,
          unitCost,
          lineTotal,
          description: cleanText(line.description, 255) || rfqItem.description || null,
        };
      });

      const subtotal = quotationItems.reduce(
        (sum, item) => sum.plus(item.lineTotal),
        new Prisma.Decimal(0),
      );
      const taxTotal = body.taxTotal ? toDecimalAmount(body.taxTotal, "taxTotal") : new Prisma.Decimal(0);
      const total = subtotal.plus(taxTotal);
      const validUntil = body.validUntil ? new Date(String(body.validUntil)) : null;
      if (validUntil && Number.isNaN(validUntil.getTime())) {
        return NextResponse.json({ error: "Valid-until date is invalid." }, { status: 400 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const invite = await tx.rfqSupplierInvite.upsert({
          where: {
            rfqId_supplierId: {
              rfqId: rfq.id,
              supplierId,
            },
          },
          create: {
            rfqId: rfq.id,
            supplierId,
            status: "RESPONDED",
            invitedAt: new Date(),
            respondedAt: new Date(),
            createdById: access.userId,
          },
          update: {
            status: "RESPONDED",
            respondedAt: new Date(),
            resubmissionRequestedAt: null,
            resubmissionReason: null,
          },
          select: {
            id: true,
          },
        });

        const existingQuotation = await tx.supplierQuotation.findUnique({
          where: {
            rfqId_supplierId: {
              rfqId: rfq.id,
              supplierId,
            },
          },
          select: {
            id: true,
            revisionNo: true,
          },
        });

        if (existingQuotation) {
          await tx.supplierQuotationItem.deleteMany({
            where: {
              supplierQuotationId: existingQuotation.id,
            },
          });
          await tx.supplierQuotation.update({
            where: { id: existingQuotation.id },
            data: {
              rfqSupplierInviteId: invite.id,
              status: "SUBMITTED",
              revisionNo: existingQuotation.revisionNo + 1,
              resubmissionRound: rfq.resubmissionRound,
              resubmissionNote: cleanText(body.resubmissionReason, 500) || null,
              quotedAt: new Date(),
              validUntil,
              submittedById: access.userId,
              currency: cleanCurrency(body.currency, supplier.currency || rfq.currency),
              subtotal,
              taxTotal,
              total,
              note: cleanText(body.quotationNote, 1000) || null,
              items: {
                create: quotationItems,
              },
            },
          });
        } else {
          await tx.supplierQuotation.create({
            data: {
              rfqId: rfq.id,
              supplierId,
              rfqSupplierInviteId: invite.id,
              status: "SUBMITTED",
              revisionNo: 1,
              resubmissionRound: rfq.resubmissionRound,
              resubmissionNote: cleanText(body.resubmissionReason, 500) || null,
              quotedAt: new Date(),
              validUntil,
              submittedById: access.userId,
              currency: cleanCurrency(body.currency, supplier.currency || rfq.currency),
              subtotal,
              taxTotal,
              total,
              note: cleanText(body.quotationNote, 1000) || null,
              items: {
                create: quotationItems,
              },
            },
          });
        }

        return tx.rfq.findUnique({
          where: { id: rfq.id },
          include: rfqInclude,
        });
      });

      if (!updated) {
        throw new Error("RFQ lookup failed after quotation submission");
      }

      await logActivity({
        action: "submit_quotation",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Submitted supplier quotation for RFQ ${updated.rfqNumber}`,
          supplierId,
          quotationTotal: total.toString(),
        },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "request_resubmission") {
      if (!access.can("rfq.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!rfq.resubmissionAllowed) {
        return NextResponse.json(
          { error: "Resubmission is disabled for this RFQ." },
          { status: 400 },
        );
      }
      if (!["SUBMITTED", "CLOSED", "AWARDED"].includes(rfq.status)) {
        return NextResponse.json(
          { error: "Resubmission can only be requested from submitted/closed/awarded RFQ." },
          { status: 400 },
        );
      }
      if (rfq.award?.purchaseOrderId) {
        return NextResponse.json(
          {
            error:
              "RFQ is already converted to purchase order and cannot be reopened for resubmission.",
          },
          { status: 400 },
        );
      }

      const reason = cleanText(body.resubmissionReason ?? body.note, 500);
      if (!reason) {
        return NextResponse.json(
          { error: "Resubmission reason is required." },
          { status: 400 },
        );
      }

      const supplierIds = parsePositiveIds(body.supplierIds);
      const targetInvites =
        supplierIds.length > 0
          ? rfq.supplierInvites.filter((invite) => supplierIds.includes(invite.supplierId))
          : rfq.supplierInvites;
      if (targetInvites.length === 0) {
        return NextResponse.json(
          { error: "No invited suppliers found for resubmission request." },
          { status: 400 },
        );
      }
      if (supplierIds.length > 0 && targetInvites.length !== supplierIds.length) {
        return NextResponse.json(
          { error: "One or more selected suppliers are not invited to this RFQ." },
          { status: 400 },
        );
      }

      const supplierContacts = await prisma.supplier.findMany({
        where: {
          id: { in: targetInvites.map((invite) => invite.supplierId) },
        },
        select: {
          id: true,
          email: true,
        },
      });
      const supplierById = new Map(
        supplierContacts.map((supplier) => [supplier.id, supplier]),
      );

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const nextRound = rfq.resubmissionRound + 1;
        const targetInviteIds = targetInvites.map((invite) => invite.id);
        const targetSupplierIds = targetInvites.map((invite) => invite.supplierId);

        await tx.rfqSupplierInvite.updateMany({
          where: {
            id: { in: targetInviteIds },
          },
          data: {
            status: "RESUBMISSION_REQUESTED",
            resubmissionRequestedAt: new Date(),
            resubmissionReason: reason,
            lastNotifiedAt: new Date(),
          },
        });

        if (rfq.award) {
          await tx.rfqAward.update({
            where: { id: rfq.award.id },
            data: {
              status: "CANCELLED",
              note: `Resubmission requested: ${reason}`.slice(0, 1000),
            },
          });
        }

        await tx.rfq.update({
          where: { id: rfq.id },
          data: {
            status: "SUBMITTED",
            closedAt: null,
            awardedAt: null,
            resubmissionRound: nextRound,
            lastResubmissionRequestedAt: new Date(),
            lastResubmissionReason: reason,
            approvedById: null,
          },
        });

        const emailIds = await createRfqNotifications({
          tx,
          rfqId: rfq.id,
          recipients: targetInvites.map((invite) => ({
            inviteId: invite.id,
            supplierId: invite.supplierId,
            recipientEmail: supplierById.get(invite.supplierId)?.email ?? null,
          })),
          message:
            `Resubmission requested for RFQ ${rfq.rfqNumber}. Reason: ${reason}` +
            (rfq.submissionDeadline
              ? ` Updated deadline: ${rfq.submissionDeadline.toISOString()}.`
              : ""),
          metadata: {
            stage: "RESUBMISSION_REQUESTED",
            rfqNumber: rfq.rfqNumber,
            reason,
            supplierIds: targetSupplierIds,
            round: nextRound,
          },
          createdById: access.userId,
        });

        const next = await tx.rfq.findUnique({
          where: { id: rfq.id },
          include: rfqInclude,
        });
        if (!next) {
          throw new Error("RFQ lookup failed after resubmission request");
        }

        return {
          updated: next,
          emailNotificationIds: emailIds,
        };
      });

      void dispatchRfqEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "request_resubmission",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Requested quotation resubmission for RFQ ${updated.rfqNumber}`,
          supplierIds: targetInvites.map((invite) => invite.supplierId),
          reason,
          round: updated.resubmissionRound,
        },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "award") {
      if (!access.can("rfq.approve", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["SUBMITTED", "CLOSED", "AWARDED"].includes(rfq.status)) {
        return NextResponse.json(
          { error: "Only submitted/closed RFQs can be awarded." },
          { status: 400 },
        );
      }
      if (isBlindReviewActive(rfq)) {
        return NextResponse.json(
          {
            error:
              "Blind review is active until the RFQ deadline. Proposal details unlock after deadline.",
          },
          { status: 400 },
        );
      }
      const finalComparativeStatement = await prisma.comparativeStatement.findFirst({
        where: {
          rfqId: rfq.id,
          status: "FINAL_APPROVED",
        },
        orderBy: [{ versionNo: "desc" }, { id: "desc" }],
        select: {
          id: true,
          csNumber: true,
          versionNo: true,
        },
      });
      if (!finalComparativeStatement) {
        return NextResponse.json(
          {
            error:
              "Final-approved Comparative Statement (CS) is required before RFQ award. Complete 3-stage CS approval workflow first.",
          },
          { status: 400 },
        );
      }

      const quotationId = Number(body.quotationId);
      if (!Number.isInteger(quotationId) || quotationId <= 0) {
        return NextResponse.json({ error: "Quotation is required." }, { status: 400 });
      }

      const quotation = rfq.quotations.find((item) => item.id === quotationId);
      if (!quotation) {
        return NextResponse.json(
          { error: "Supplier quotation not found for this RFQ." },
          { status: 404 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const existingAward = await tx.rfqAward.findUnique({
          where: { rfqId: rfq.id },
          select: {
            id: true,
            purchaseOrderId: true,
          },
        });
        if (existingAward?.purchaseOrderId) {
          throw new Error("Award is already converted to purchase order and cannot be changed.");
        }

        await tx.rfqAward.upsert({
          where: { rfqId: rfq.id },
          create: {
            rfqId: rfq.id,
            supplierId: quotation.supplierId,
            supplierQuotationId: quotation.id,
            status: "AWARDED",
            awardedById: access.userId,
            awardedAt: new Date(),
            note: cleanText(body.note, 1000) || null,
          },
          update: {
            supplierId: quotation.supplierId,
            supplierQuotationId: quotation.id,
            status: "AWARDED",
            awardedById: access.userId,
            awardedAt: new Date(),
            note: cleanText(body.note, 1000) || null,
            purchaseOrderId: null,
          },
        });

        await tx.rfq.update({
          where: { id: rfq.id },
          data: {
            status: "AWARDED",
            awardedAt: new Date(),
            approvedById: access.userId,
          },
        });

        await tx.rfqSupplierInvite.updateMany({
          where: { rfqId: rfq.id },
          data: { status: "RESPONDED" },
        });
        await tx.rfqSupplierInvite.updateMany({
          where: {
            rfqId: rfq.id,
            supplierId: quotation.supplierId,
          },
          data: {
            status: "AWARDED",
            respondedAt: new Date(),
          },
        });

        return tx.rfq.findUnique({
          where: { id: rfq.id },
          include: rfqInclude,
        });
      });

      if (!updated) {
        throw new Error("RFQ lookup failed after award");
      }

      await logActivity({
        action: "award",
        entity: "rfq",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Awarded RFQ ${updated.rfqNumber} to supplier ${quotation.supplier.code}`,
          quotationId: quotation.id,
          supplierId: quotation.supplierId,
          comparativeStatementId: finalComparativeStatement.id,
          comparativeStatementNumber: finalComparativeStatement.csNumber,
          comparativeStatementVersion: finalComparativeStatement.versionNo,
        },
        before,
        after: toRfqLogSnapshot(updated),
      });

      return NextResponse.json(toAdminRfqView(updated));
    }

    if (action === "convert_to_po") {
      if (!access.can("purchase_orders.manage", rfq.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (rfq.status !== "AWARDED") {
        return NextResponse.json(
          { error: "Only awarded RFQs can be converted to purchase order." },
          { status: 400 },
        );
      }
      if (!rfq.award) {
        return NextResponse.json(
          { error: "RFQ has no award decision to convert." },
          { status: 400 },
        );
      }
      if (rfq.award.purchaseOrderId) {
        return NextResponse.json(
          { error: "RFQ award is already linked to a purchase order." },
          { status: 400 },
        );
      }

      const awardedQuotation = rfq.quotations.find(
        (quotation) => quotation.id === rfq.award?.supplierQuotationId,
      );
      if (!awardedQuotation) {
        return NextResponse.json(
          { error: "Awarded quotation record was not found." },
          { status: 404 },
        );
      }
      if (awardedQuotation.items.length === 0) {
        return NextResponse.json(
          { error: "Awarded quotation contains no line items." },
          { status: 400 },
        );
      }

      const purchaseOrderItems = awardedQuotation.items.map((item) => ({
        productVariantId: item.productVariantId,
        quantityOrdered: item.quantityQuoted,
        unitCost: item.unitCost,
        description:
          item.description ||
          `${item.productVariant.product.name} (${item.productVariant.sku})`,
        lineTotal: item.lineTotal,
      }));
      const totals = computePurchaseOrderTotals(
        purchaseOrderItems.map((item) => ({
          quantityOrdered: item.quantityOrdered,
          unitCost: item.unitCost,
        })),
      );
      const latestFinalComparative = await prisma.comparativeStatement.findFirst({
        where: {
          rfqId: rfq.id,
          status: "FINAL_APPROVED",
        },
        orderBy: [{ versionNo: "desc" }, { id: "desc" }],
        select: {
          id: true,
        },
      });

      const createdPurchaseOrder = await prisma.$transaction(async (tx) => {
        const poNumber = await generatePurchaseOrderNumber(tx);
        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            poNumber,
            supplierId: awardedQuotation.supplierId,
            purchaseRequisitionId: rfq.purchaseRequisitionId,
            sourceComparativeStatementId: latestFinalComparative?.id ?? null,
            warehouseId: rfq.warehouseId,
            approvalStage: "DRAFT",
            expectedAt: rfq.submissionDeadline ?? null,
            notes:
              cleanText(body.note, 1000) ||
              `Created from RFQ ${rfq.rfqNumber} award.`,
            termsAndConditions: rfq.termsAndConditions ?? null,
            currency: cleanCurrency(awardedQuotation.currency, rfq.currency),
            createdById: access.userId,
            subtotal: totals.subtotal,
            taxTotal: totals.taxTotal,
            shippingTotal: totals.shippingTotal,
            grandTotal: totals.grandTotal,
            items: {
              create: purchaseOrderItems,
            },
          },
          include: purchaseOrderInclude,
        });

        await tx.rfqAward.update({
          where: { id: rfq.award!.id },
          data: {
            status: "CONVERTED_TO_PO",
            purchaseOrderId: purchaseOrder.id,
          },
        });

        return purchaseOrder;
      });

      const updatedRfq = await prisma.rfq.findUnique({
        where: { id: rfq.id },
        include: rfqInclude,
      });
      if (!updatedRfq) {
        throw new Error("RFQ lookup failed after purchase order conversion");
      }

      await logActivity({
        action: "convert_to_po",
        entity: "rfq",
        entityId: updatedRfq.id,
        access,
        request,
        metadata: {
          message: `Converted RFQ ${updatedRfq.rfqNumber} to PO ${createdPurchaseOrder.poNumber}`,
          purchaseOrderId: createdPurchaseOrder.id,
        },
        before,
        after: toRfqLogSnapshot(updatedRfq),
      });

      await logActivity({
        action: "create",
        entity: "purchase_order",
        entityId: createdPurchaseOrder.id,
        access,
        request,
        metadata: {
          message: `Created purchase order ${createdPurchaseOrder.poNumber} from RFQ ${updatedRfq.rfqNumber}`,
          rfqId: updatedRfq.id,
        },
        after: toPurchaseOrderLogSnapshot(createdPurchaseOrder),
      });

      return NextResponse.json({
        rfq: toAdminRfqView(updatedRfq),
        purchaseOrder: createdPurchaseOrder,
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM RFQ PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update RFQ." },
      { status: 500 },
    );
  }
}
