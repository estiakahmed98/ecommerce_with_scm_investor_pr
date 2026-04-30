import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSupplierPortalContext } from "@/lib/supplier-portal";
import { toDecimalAmount } from "@/lib/scm";
import { logActivity } from "@/lib/activity-log";

type ProposalAttachmentType = "TECHNICAL" | "FINANCIAL" | "SUPPORTING";

const PROPOSAL_ATTACHMENT_TYPES = new Set<ProposalAttachmentType>([
  "TECHNICAL",
  "FINANCIAL",
  "SUPPORTING",
]);

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanCurrency(value: unknown, fallback = "BDT") {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : fallback;
  return raw.length === 3 ? raw : fallback;
}

function cleanProposalAttachmentType(value: unknown): ProposalAttachmentType {
  if (typeof value !== "string") return "SUPPORTING";
  const parsed = value.trim().toUpperCase() as ProposalAttachmentType;
  return PROPOSAL_ATTACHMENT_TYPES.has(parsed) ? parsed : "SUPPORTING";
}

function normalizeQuotationAttachments(attachments: unknown): Array<{
  proposalType: ProposalAttachmentType;
  label: string | null;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
}> {
  if (!Array.isArray(attachments)) return [];

  const normalized = attachments.map((attachment, index) => {
    const item =
      attachment && typeof attachment === "object"
        ? (attachment as Record<string, unknown>)
        : null;
    const fileUrl = cleanText(item?.fileUrl, 1200);
    if (!fileUrl) {
      throw new Error(`Proposal attachment ${index + 1}: file URL is required.`);
    }
    if (fileUrl.includes("..")) {
      throw new Error(`Proposal attachment ${index + 1}: file URL is invalid.`);
    }
    if (!fileUrl.startsWith("/")) {
      throw new Error(
        `Proposal attachment ${index + 1}: only internal upload URLs are allowed.`,
      );
    }
    if (
      !fileUrl.startsWith("/api/upload/scm-proposals/") &&
      !fileUrl.startsWith("/upload/")
    ) {
      throw new Error(
        `Proposal attachment ${index + 1}: unsupported upload path.`,
      );
    }

    const fileSizeRaw = item?.fileSize;
    const fileSize =
      fileSizeRaw === null || fileSizeRaw === undefined || fileSizeRaw === ""
        ? null
        : Number(fileSizeRaw);
    if (fileSize !== null && (!Number.isInteger(fileSize) || fileSize < 0)) {
      throw new Error(`Proposal attachment ${index + 1}: file size is invalid.`);
    }

    return {
      proposalType: cleanProposalAttachmentType(item?.proposalType),
      label: cleanText(item?.label, 160) || null,
      fileUrl,
      fileName: cleanText(item?.fileName, 255) || null,
      mimeType: cleanText(item?.mimeType, 120) || null,
      fileSize,
    };
  });

  const seen = new Set<string>();
  for (const attachment of normalized) {
    const dedupeKey = [
      attachment.proposalType,
      attachment.fileUrl,
      attachment.fileName ?? "",
    ].join("|");
    if (seen.has(dedupeKey)) {
      throw new Error("Duplicate proposal attachment detected.");
    }
    seen.add(dedupeKey);
  }

  return normalized;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const rfqs = await prisma.rfq.findMany({
      where: {
        AND: [
          { supplierInvites: { some: { supplierId: resolved.context.supplierId } } },
          {
            OR: [
              { categoryTargets: { none: {} } },
              {
                categoryTargets: {
                  some: {
                    supplierCategory: {
                      suppliers: {
                        some: {
                          supplierId: resolved.context.supplierId,
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
        ...(status
          ? {
              status: status as Prisma.EnumRfqStatusFilter["equals"],
            }
          : {}),
        ...(search
          ? {
              OR: [
                { rfqNumber: { contains: search, mode: "insensitive" } },
                { warehouse: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        rfqNumber: true,
        status: true,
        currency: true,
        requestedAt: true,
        submissionDeadline: true,
        note: true,
        scopeOfWork: true,
        termsAndConditions: true,
        boqDetails: true,
        technicalSpecifications: true,
        evaluationCriteria: true,
        resubmissionAllowed: true,
        resubmissionRound: true,
        lastResubmissionRequestedAt: true,
        lastResubmissionReason: true,
        categoryTargets: {
          orderBy: { id: "asc" },
          select: {
            supplierCategory: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        attachments: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            label: true,
            fileUrl: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            createdAt: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            description: true,
            quantityRequested: true,
            targetUnitCost: true,
            productVariant: {
              select: {
                id: true,
                sku: true,
                product: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        supplierInvites: {
          where: { supplierId: resolved.context.supplierId },
          select: {
            id: true,
            status: true,
            invitedAt: true,
            respondedAt: true,
            lastNotifiedAt: true,
            resubmissionRequestedAt: true,
            resubmissionReason: true,
            note: true,
          },
        },
        quotations: {
          where: { supplierId: resolved.context.supplierId },
          orderBy: [{ quotedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            revisionNo: true,
            resubmissionRound: true,
            resubmissionNote: true,
            quotedAt: true,
            validUntil: true,
            subtotal: true,
            taxTotal: true,
            total: true,
            currency: true,
            note: true,
            technicalProposal: true,
            financialProposal: true,
            items: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                rfqItemId: true,
                productVariantId: true,
                quantityQuoted: true,
                unitCost: true,
                lineTotal: true,
                description: true,
              },
            },
            attachments: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                proposalType: true,
                label: true,
                fileUrl: true,
                fileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
              },
            },
          },
        },
        award: {
          select: {
            id: true,
            supplierId: true,
            status: true,
            awardedAt: true,
            purchaseOrderId: true,
            purchaseOrder: {
              select: {
                id: true,
                poNumber: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      rfqs.map((rfq) => {
        const nowMs = Date.now();
        const invite = rfq.supplierInvites[0] ?? null;
        const latestQuote = rfq.quotations[0] ?? null;
        const deadlineMs = rfq.submissionDeadline?.getTime() ?? null;
        const isSubmissionWindowOpen = deadlineMs === null || nowMs <= deadlineMs;
        const canSubmitQuote =
          (rfq.status === "SUBMITTED" || rfq.status === "CLOSED") &&
          invite !== null &&
          invite.status !== "AWARDED" &&
          invite.status !== "DECLINED" &&
          isSubmissionWindowOpen;
        return {
          id: rfq.id,
          rfqNumber: rfq.rfqNumber,
          status: rfq.status,
          currency: rfq.currency,
          requestedAt: rfq.requestedAt.toISOString(),
          submissionDeadline: rfq.submissionDeadline?.toISOString() ?? null,
          note: rfq.note,
          scopeOfWork: rfq.scopeOfWork,
          termsAndConditions: rfq.termsAndConditions,
          boqDetails: rfq.boqDetails,
          technicalSpecifications: rfq.technicalSpecifications,
          evaluationCriteria: rfq.evaluationCriteria,
          resubmissionAllowed: rfq.resubmissionAllowed,
          resubmissionRound: rfq.resubmissionRound,
          lastResubmissionRequestedAt:
            rfq.lastResubmissionRequestedAt?.toISOString() ?? null,
          lastResubmissionReason: rfq.lastResubmissionReason,
          isSubmissionWindowOpen,
          isSubmissionDeadlinePassed: !isSubmissionWindowOpen,
          canSubmitQuote,
          warehouse: rfq.warehouse,
          categories: rfq.categoryTargets.map((target) => ({
            id: target.supplierCategory.id,
            code: target.supplierCategory.code,
            name: target.supplierCategory.name,
          })),
          attachments: rfq.attachments.map((attachment) => ({
            id: attachment.id,
            label: attachment.label,
            fileUrl: attachment.fileUrl,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSize,
            createdAt: attachment.createdAt.toISOString(),
          })),
          invite: invite
            ? {
                id: invite.id,
                status: invite.status,
                invitedAt: invite.invitedAt.toISOString(),
                respondedAt: invite.respondedAt?.toISOString() ?? null,
                lastNotifiedAt: invite.lastNotifiedAt?.toISOString() ?? null,
                resubmissionRequestedAt:
                  invite.resubmissionRequestedAt?.toISOString() ?? null,
                resubmissionReason: invite.resubmissionReason,
                note: invite.note,
              }
            : null,
          items: rfq.items.map((item) => ({
            id: item.id,
            description: item.description,
            quantityRequested: item.quantityRequested,
            targetUnitCost: item.targetUnitCost?.toString() ?? null,
            variantId: item.productVariant.id,
            sku: item.productVariant.sku,
            productName: item.productVariant.product.name,
          })),
          quotation: latestQuote
            ? {
              id: latestQuote.id,
              status: latestQuote.status,
              revisionNo: latestQuote.revisionNo,
              resubmissionRound: latestQuote.resubmissionRound,
              resubmissionNote: latestQuote.resubmissionNote,
              quotedAt: latestQuote.quotedAt.toISOString(),
                validUntil: latestQuote.validUntil?.toISOString() ?? null,
                subtotal: latestQuote.subtotal.toString(),
                taxTotal: latestQuote.taxTotal.toString(),
                total: latestQuote.total.toString(),
                currency: latestQuote.currency,
                note: latestQuote.note,
                technicalProposal: latestQuote.technicalProposal,
                financialProposal: latestQuote.financialProposal,
                items: latestQuote.items.map((item) => ({
                  id: item.id,
                  rfqItemId: item.rfqItemId,
                  productVariantId: item.productVariantId,
                  quantityQuoted: item.quantityQuoted,
                  unitCost: item.unitCost.toString(),
                  lineTotal: item.lineTotal.toString(),
                  description: item.description,
                })),
                attachments: latestQuote.attachments.map((attachment) => ({
                  id: attachment.id,
                  proposalType: attachment.proposalType,
                  label: attachment.label,
                  fileUrl: attachment.fileUrl,
                  fileName: attachment.fileName,
                  mimeType: attachment.mimeType,
                  fileSize: attachment.fileSize,
                  createdAt: attachment.createdAt.toISOString(),
                })),
              }
            : null,
          award: rfq.award
            ? {
                id: rfq.award.id,
                supplierId: rfq.award.supplierId,
                status: rfq.award.status,
                awardedAt: rfq.award.awardedAt.toISOString(),
                purchaseOrderId: rfq.award.purchaseOrderId,
                purchaseOrder: rfq.award.purchaseOrder,
                isAwardedToCurrentSupplier:
                  rfq.award.supplierId === resolved.context.supplierId,
              }
            : null,
        };
      }),
    );
  } catch (error) {
    console.error("SUPPLIER PORTAL RFQ GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier RFQs." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const resolved = await resolveSupplierPortalContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    if (!resolved.context.access.has("supplier.rfq.quote.submit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      rfqId?: unknown;
      validUntil?: unknown;
      quotationNote?: unknown;
      technicalProposal?: unknown;
      financialProposal?: unknown;
      taxTotal?: unknown;
      currency?: unknown;
      attachments?: unknown;
      items?: Array<{
        rfqItemId?: unknown;
        quantityQuoted?: unknown;
        unitCost?: unknown;
        description?: unknown;
      }>;
    };

    const rfqId = Number(body.rfqId);
    if (!Number.isInteger(rfqId) || rfqId <= 0) {
      return NextResponse.json({ error: "RFQ is required." }, { status: 400 });
    }

    const rfq = await prisma.rfq.findFirst({
      where: {
        AND: [
          { id: rfqId },
          {
            supplierInvites: {
              some: {
                supplierId: resolved.context.supplierId,
              },
            },
          },
          {
            OR: [
              { categoryTargets: { none: {} } },
              {
                categoryTargets: {
                  some: {
                    supplierCategory: {
                      suppliers: {
                        some: {
                          supplierId: resolved.context.supplierId,
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        rfqNumber: true,
        status: true,
        resubmissionRound: true,
        submissionDeadline: true,
        currency: true,
        items: {
          select: {
            id: true,
            productVariantId: true,
            description: true,
            quantityRequested: true,
          },
        },
        supplierInvites: {
          where: { supplierId: resolved.context.supplierId },
          select: {
            id: true,
            status: true,
            resubmissionRequestedAt: true,
            resubmissionReason: true,
          },
          take: 1,
        },
      },
    });

    if (!rfq) {
      return NextResponse.json({ error: "RFQ invitation not found." }, { status: 404 });
    }
    if (!["SUBMITTED", "CLOSED"].includes(rfq.status)) {
      return NextResponse.json(
        { error: "Quotations are only accepted while RFQ is submitted or closed." },
        { status: 400 },
      );
    }
    if (
      rfq.submissionDeadline &&
      new Date().getTime() > rfq.submissionDeadline.getTime()
    ) {
      return NextResponse.json(
        {
          error:
            "Submission deadline has passed. Proposal editing is locked for this RFQ.",
        },
        { status: 400 },
      );
    }

    const invite = rfq.supplierInvites[0];
    if (!invite) {
      return NextResponse.json({ error: "Supplier invitation not found." }, { status: 404 });
    }
    if (invite.status === "AWARDED" || invite.status === "DECLINED") {
      return NextResponse.json(
        { error: "This invitation is no longer open for quotation." },
        { status: 400 },
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
        throw new Error(`Quotation line ${index + 1}: RFQ line is required.`);
      }
      if (seenRfqItemIds.has(rfqItemId)) {
        throw new Error(`Quotation line ${index + 1}: duplicate RFQ line selected.`);
      }
      seenRfqItemIds.add(rfqItemId);

      const rfqItem = rfqItemMap.get(rfqItemId);
      if (!rfqItem) {
        throw new Error(`Quotation line ${index + 1}: RFQ item not found.`);
      }

      const quantityQuoted = Number(line.quantityQuoted);
      if (!Number.isInteger(quantityQuoted) || quantityQuoted <= 0) {
        throw new Error(`Quotation line ${index + 1}: quantity must be greater than 0.`);
      }
      const unitCost = toDecimalAmount(line.unitCost, `Line ${index + 1} unit cost`);
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
    const taxTotal =
      body.taxTotal === undefined || body.taxTotal === null || body.taxTotal === ""
        ? new Prisma.Decimal(0)
        : toDecimalAmount(body.taxTotal, "Tax total");
    const total = subtotal.plus(taxTotal);
    const validUntil = body.validUntil ? new Date(String(body.validUntil)) : null;
    if (validUntil && Number.isNaN(validUntil.getTime())) {
      return NextResponse.json({ error: "Valid-until date is invalid." }, { status: 400 });
    }
    const attachmentsInput =
      body.attachments === undefined
        ? null
        : normalizeQuotationAttachments(body.attachments);
    const technicalProposal = cleanText(body.technicalProposal, 8000) || null;
    const financialProposal = cleanText(body.financialProposal, 8000) || null;

    const updatedQuotation = await prisma.$transaction(async (tx) => {
      const existing = await tx.supplierQuotation.findUnique({
        where: {
          rfqId_supplierId: {
            rfqId: rfq.id,
            supplierId: resolved.context.supplierId,
          },
        },
        select: { id: true, revisionNo: true },
      });

      await tx.rfqSupplierInvite.update({
        where: { id: invite.id },
        data: {
          status: "RESPONDED",
          respondedAt: new Date(),
          resubmissionRequestedAt: null,
          resubmissionReason: null,
        },
      });

      if (existing) {
        await tx.supplierQuotationItem.deleteMany({
          where: { supplierQuotationId: existing.id },
        });
        if (attachmentsInput !== null) {
          await tx.supplierQuotationAttachment.deleteMany({
            where: { supplierQuotationId: existing.id },
          });
        }
        return tx.supplierQuotation.update({
          where: { id: existing.id },
          data: {
            status: "SUBMITTED",
            revisionNo: existing.revisionNo + 1,
            resubmissionRound: rfq.resubmissionRound,
            resubmissionNote: invite.resubmissionReason || null,
            quotedAt: new Date(),
            validUntil,
            submittedById: resolved.context.userId,
            currency: cleanCurrency(body.currency, rfq.currency),
            subtotal,
            taxTotal,
            total,
            note: cleanText(body.quotationNote, 1000) || null,
            technicalProposal,
            financialProposal,
            items: {
              create: quotationItems,
            },
            ...(attachmentsInput !== null
              ? {
                  attachments: {
                    create: attachmentsInput.map((attachment) => ({
                      proposalType: attachment.proposalType,
                      label: attachment.label,
                      fileUrl: attachment.fileUrl,
                      fileName: attachment.fileName,
                      mimeType: attachment.mimeType,
                      fileSize: attachment.fileSize,
                      uploadedById: resolved.context.userId,
                    })),
                  },
                }
              : {}),
          },
          select: {
            id: true,
            rfqId: true,
            supplierId: true,
            status: true,
            revisionNo: true,
            resubmissionRound: true,
            resubmissionNote: true,
            quotedAt: true,
            validUntil: true,
            currency: true,
            subtotal: true,
            taxTotal: true,
            total: true,
            note: true,
            technicalProposal: true,
            financialProposal: true,
            items: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                rfqItemId: true,
                productVariantId: true,
                quantityQuoted: true,
                unitCost: true,
                lineTotal: true,
                description: true,
              },
            },
            attachments: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                proposalType: true,
                label: true,
                fileUrl: true,
                fileName: true,
                mimeType: true,
                fileSize: true,
                createdAt: true,
              },
            },
          },
        });
      }

      return tx.supplierQuotation.create({
        data: {
          rfqId: rfq.id,
          supplierId: resolved.context.supplierId,
          rfqSupplierInviteId: invite.id,
          status: "SUBMITTED",
          revisionNo: 1,
          resubmissionRound: rfq.resubmissionRound,
          resubmissionNote: invite.resubmissionReason || null,
          quotedAt: new Date(),
          validUntil,
          submittedById: resolved.context.userId,
          currency: cleanCurrency(body.currency, rfq.currency),
          subtotal,
          taxTotal,
          total,
          note: cleanText(body.quotationNote, 1000) || null,
          technicalProposal,
          financialProposal,
          items: {
            create: quotationItems,
          },
          ...(attachmentsInput !== null
            ? {
                attachments: {
                  create: attachmentsInput.map((attachment) => ({
                    proposalType: attachment.proposalType,
                    label: attachment.label,
                    fileUrl: attachment.fileUrl,
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType,
                    fileSize: attachment.fileSize,
                    uploadedById: resolved.context.userId,
                  })),
                },
              }
            : {}),
        },
        select: {
          id: true,
          rfqId: true,
          supplierId: true,
          status: true,
          revisionNo: true,
          resubmissionRound: true,
          resubmissionNote: true,
          quotedAt: true,
          validUntil: true,
          currency: true,
          subtotal: true,
          taxTotal: true,
          total: true,
          note: true,
          technicalProposal: true,
          financialProposal: true,
          items: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              rfqItemId: true,
              productVariantId: true,
              quantityQuoted: true,
              unitCost: true,
              lineTotal: true,
              description: true,
            },
          },
          attachments: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              proposalType: true,
              label: true,
              fileUrl: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              createdAt: true,
            },
          },
        },
      });
    });

    await logActivity({
      action: "submit_quotation",
      entity: "supplier_quotation",
      entityId: updatedQuotation.id,
      access: resolved.context.access,
      request,
      metadata: {
        message: `Supplier ${resolved.context.supplierCode} submitted quotation for RFQ ${rfq.rfqNumber}`,
        rfqId: rfq.id,
        rfqNumber: rfq.rfqNumber,
        supplierId: resolved.context.supplierId,
        quotationTotal: updatedQuotation.total.toString(),
      },
      after: {
        rfqId: updatedQuotation.rfqId,
        supplierId: updatedQuotation.supplierId,
        status: updatedQuotation.status,
        revisionNo: updatedQuotation.revisionNo,
        resubmissionRound: updatedQuotation.resubmissionRound,
        resubmissionNote: updatedQuotation.resubmissionNote,
        quotedAt: updatedQuotation.quotedAt.toISOString(),
        validUntil: updatedQuotation.validUntil?.toISOString() ?? null,
        currency: updatedQuotation.currency,
        subtotal: updatedQuotation.subtotal.toString(),
        taxTotal: updatedQuotation.taxTotal.toString(),
        total: updatedQuotation.total.toString(),
        technicalProposal: updatedQuotation.technicalProposal,
        financialProposal: updatedQuotation.financialProposal,
      },
    });

    return NextResponse.json({
      id: updatedQuotation.id,
      rfqId: updatedQuotation.rfqId,
      status: updatedQuotation.status,
      revisionNo: updatedQuotation.revisionNo,
      resubmissionRound: updatedQuotation.resubmissionRound,
      resubmissionNote: updatedQuotation.resubmissionNote,
      quotedAt: updatedQuotation.quotedAt.toISOString(),
      validUntil: updatedQuotation.validUntil?.toISOString() ?? null,
      currency: updatedQuotation.currency,
      subtotal: updatedQuotation.subtotal.toString(),
      taxTotal: updatedQuotation.taxTotal.toString(),
      total: updatedQuotation.total.toString(),
      note: updatedQuotation.note,
      technicalProposal: updatedQuotation.technicalProposal,
      financialProposal: updatedQuotation.financialProposal,
      items: updatedQuotation.items.map((item) => ({
        id: item.id,
        rfqItemId: item.rfqItemId,
        productVariantId: item.productVariantId,
        quantityQuoted: item.quantityQuoted,
        unitCost: item.unitCost.toString(),
        lineTotal: item.lineTotal.toString(),
        description: item.description,
      })),
      attachments: updatedQuotation.attachments.map((attachment) => ({
        id: attachment.id,
        proposalType: attachment.proposalType,
        label: attachment.label,
        fileUrl: attachment.fileUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        createdAt: attachment.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("SUPPLIER PORTAL RFQ POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to submit quotation." },
      { status: 500 },
    );
  }
}
