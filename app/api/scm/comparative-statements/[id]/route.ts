import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  comparativeStatementInclude,
  computePurchaseOrderTotals,
  generatePurchaseOrderNumber,
  purchaseOrderInclude,
  toComparativeStatementLogSnapshot,
  toPurchaseOrderLogSnapshot,
} from "@/lib/scm";
import {
  computeComparativeScores,
  normalizeWeightInput,
  resolveWeightPair,
} from "@/lib/comparative-statements";
import { resolvePurchaseOrderTermsTemplate } from "@/lib/purchase-order-terms";
import {
  createComparativeStatementNotifications,
  dispatchComparativeStatementEmailNotifications,
} from "@/lib/comparative-statement-notifications";

const COMPARATIVE_STATEMENT_READ_PERMISSIONS = [
  "comparative_statements.read",
  "comparative_statements.manage",
  "comparative_statements.approve_manager",
  "comparative_statements.approve_committee",
  "comparative_statements.approve_final",
] as const;

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadComparativeStatements(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasAny([...COMPARATIVE_STATEMENT_READ_PERMISSIONS]);
}

function hasGlobalComparativeStatementScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return COMPARATIVE_STATEMENT_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function canAccessComparativeStatement(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
) {
  return (
    hasGlobalComparativeStatementScope(access) || access.canAccessWarehouse(warehouseId)
  );
}

async function resolveUsersByPermission(
  tx: Prisma.TransactionClient,
  permissionKeys: string[],
  warehouseId: number,
) {
  if (permissionKeys.length === 0) return [] as Array<{ id: string; email: string }>;
  return tx.user.findMany({
    where: {
      userRoles: {
        some: {
          OR: [{ scopeType: "GLOBAL" }, { scopeType: "WAREHOUSE", warehouseId }],
          role: {
            rolePermissions: {
              some: {
                permission: {
                  key: { in: permissionKeys },
                },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

function getRecommendedFinancialTotal(lines: Array<{
  isResponsive: boolean;
  financialGrandTotal: Prisma.Decimal;
  rank: number | null;
}>) {
  const responsive = lines.filter((line) => line.isResponsive);
  if (responsive.length === 0) return null;
  const rankedTop = responsive.find((line) => line.rank === 1);
  if (rankedTop) return rankedTop.financialGrandTotal;
  return responsive.reduce((current, line) => {
    if (!current) return line.financialGrandTotal;
    return line.financialGrandTotal.lt(current) ? line.financialGrandTotal : current;
  }, null as Prisma.Decimal | null);
}

function passesFinalAuthorityMatrix(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
  recommendedAmount: Prisma.Decimal | null,
) {
  if (!access.can("comparative_statements.approve_final", warehouseId)) {
    return false;
  }
  const amount = Number(recommendedAmount?.toString() || "0");
  if (amount > 1_000_000) {
    return (
      access.can("purchase_orders.approve", warehouseId) && access.has("settings.manage")
    );
  }
  if (amount > 300_000) {
    return access.can("purchase_orders.approve", warehouseId);
  }
  return true;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const comparativeStatementId = Number(id);
    if (!Number.isInteger(comparativeStatementId) || comparativeStatementId <= 0) {
      return NextResponse.json({ error: "Invalid comparative statement id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadComparativeStatements(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const statement = await prisma.comparativeStatement.findUnique({
      where: { id: comparativeStatementId },
      include: comparativeStatementInclude,
    });
    if (!statement) {
      return NextResponse.json({ error: "Comparative statement not found." }, { status: 404 });
    }
    if (!canAccessComparativeStatement(access, statement.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(statement);
  } catch (error) {
    console.error("SCM COMPARATIVE STATEMENT GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load comparative statement." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const comparativeStatementId = Number(id);
    if (!Number.isInteger(comparativeStatementId) || comparativeStatementId <= 0) {
      return NextResponse.json({ error: "Invalid comparative statement id." }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const statement = await prisma.comparativeStatement.findUnique({
      where: { id: comparativeStatementId },
      include: comparativeStatementInclude,
    });
    if (!statement) {
      return NextResponse.json({ error: "Comparative statement not found." }, { status: 404 });
    }
    if (!canAccessComparativeStatement(access, statement.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      note?: unknown;
      rejectionNote?: unknown;
      termsTemplateId?: unknown;
      termsAndConditions?: unknown;
      expectedAt?: unknown;
      technicalWeight?: unknown;
      financialWeight?: unknown;
      lines?: Array<{
        id?: unknown;
        technicalScore?: unknown;
        isResponsive?: unknown;
        technicalNote?: unknown;
        financialNote?: unknown;
      }>;
    };
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const before = toComparativeStatementLogSnapshot(statement);

    if (!action) {
      if (!access.can("comparative_statements.manage", statement.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (["FINAL_APPROVED", "CANCELLED"].includes(statement.status)) {
        return NextResponse.json(
          { error: "Approved/cancelled comparative statements are locked from edit." },
          { status: 400 },
        );
      }

      const technicalWeightInput = normalizeWeightInput(
        body.technicalWeight,
        "Technical weight",
      );
      const financialWeightInput = normalizeWeightInput(
        body.financialWeight,
        "Financial weight",
      );
      const nextWeights =
        technicalWeightInput !== null || financialWeightInput !== null
          ? resolveWeightPair({
              technicalWeight: technicalWeightInput ?? statement.technicalWeight,
              financialWeight: financialWeightInput ?? statement.financialWeight,
            })
          : {
              technicalWeight: statement.technicalWeight,
              financialWeight: statement.financialWeight,
            };

      const linePayload = Array.isArray(body.lines) ? body.lines : [];
      const lineMap = new Map(statement.lines.map((line) => [line.id, line]));
      const overrideById = new Map<
        number,
        {
          technicalScore?: Prisma.Decimal;
          isResponsive?: boolean;
          technicalNote?: string | null;
          financialNote?: string | null;
        }
      >();

      for (const lineRow of linePayload) {
        const lineId = Number(lineRow.id);
        if (!Number.isInteger(lineId) || lineId <= 0 || !lineMap.has(lineId)) {
          return NextResponse.json({ error: "Invalid comparative line id." }, { status: 400 });
        }

        const override: {
          technicalScore?: Prisma.Decimal;
          isResponsive?: boolean;
          technicalNote?: string | null;
          financialNote?: string | null;
        } = {};
        if (
          lineRow.technicalScore !== undefined &&
          lineRow.technicalScore !== null &&
          lineRow.technicalScore !== ""
        ) {
          const numeric = Number(lineRow.technicalScore);
          if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
            return NextResponse.json(
              { error: "Technical score must be between 0 and 100." },
              { status: 400 },
            );
          }
          override.technicalScore = new Prisma.Decimal(numeric);
        }
        if (lineRow.isResponsive !== undefined) {
          override.isResponsive = Boolean(lineRow.isResponsive);
        }
        if (lineRow.technicalNote !== undefined) {
          override.technicalNote = cleanText(lineRow.technicalNote, 600) || null;
        }
        if (lineRow.financialNote !== undefined) {
          override.financialNote = cleanText(lineRow.financialNote, 600) || null;
        }
        overrideById.set(lineId, override);
      }

      const scoreInputs = statement.lines.map((line) => {
        const override = overrideById.get(line.id);
        return {
          id: line.id,
          financialGrandTotal: line.financialGrandTotal,
          technicalScore: override?.technicalScore ?? line.technicalScore,
          isResponsive: override?.isResponsive ?? line.isResponsive,
        };
      });
      const scored = computeComparativeScores(
        scoreInputs,
        nextWeights.technicalWeight,
        nextWeights.financialWeight,
      );
      const scoredById = new Map(scored.map((line) => [line.id, line]));

      const updated = await prisma.$transaction(async (tx) => {
        await tx.comparativeStatement.update({
          where: { id: statement.id },
          data: {
            technicalWeight: nextWeights.technicalWeight,
            financialWeight: nextWeights.financialWeight,
            note:
              body.note !== undefined
                ? cleanText(body.note, 1000) || null
                : statement.note,
            updatedById: access.userId,
          },
        });

        for (const line of statement.lines) {
          const computed = scoredById.get(line.id);
          if (!computed) continue;
          const override = overrideById.get(line.id);
          await tx.comparativeStatementLine.update({
            where: { id: line.id },
            data: {
              technicalScore: computed.technicalScore,
              financialScore: computed.financialScore,
              combinedScore: computed.combinedScore,
              rank: computed.rank,
              isResponsive: computed.isResponsive,
              technicalNote:
                override?.technicalNote !== undefined
                  ? override.technicalNote
                  : line.technicalNote,
              financialNote:
                override?.financialNote !== undefined
                  ? override.financialNote
                  : line.financialNote,
            },
          });
        }

        const next = await tx.comparativeStatement.findUnique({
          where: { id: statement.id },
          include: comparativeStatementInclude,
        });
        if (!next) {
          throw new Error("Comparative statement lookup failed after update.");
        }
        return next;
      });

      await logActivity({
        action: "update",
        entity: "comparative_statement",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Updated comparative statement ${updated.csNumber}`,
        },
        before,
        after: toComparativeStatementLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "submit") {
      if (!access.can("comparative_statements.manage", statement.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (statement.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft comparative statements can be submitted." },
          { status: 400 },
        );
      }
      if (statement.lines.length === 0) {
        return NextResponse.json(
          { error: "Comparative statement requires at least one proposal line." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.comparativeStatement.update({
          where: { id: statement.id },
          data: {
            status: "SUBMITTED",
            approvalStage: "MANAGER_REVIEW",
            submittedAt: new Date(),
            updatedById: access.userId,
            note:
              body.note !== undefined
                ? cleanText(body.note, 1000) || null
                : statement.note,
          },
          include: comparativeStatementInclude,
        });

        await tx.comparativeStatementApprovalEvent.create({
          data: {
            comparativeStatementId: next.id,
            stage: "SUBMISSION",
            decision: "SUBMITTED",
            note: cleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["comparative_statements.approve_manager"],
          next.warehouseId,
        );
        const emailIds = await createComparativeStatementNotifications({
          tx,
          comparativeStatementId: next.id,
          stage: "SUBMISSION",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Comparative statement ${next.csNumber} is submitted and waiting for Procurement/Admin Manager approval.`,
          metadata: {
            status: next.status,
            stage: next.approvalStage,
            csNumber: next.csNumber,
            rfqNumber: next.rfq.rfqNumber,
          },
        });

        return {
          updated: next,
          emailNotificationIds: emailIds,
        };
      });

      void dispatchComparativeStatementEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "submit",
        entity: "comparative_statement",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Submitted comparative statement ${updated.csNumber}`,
        },
        before,
        after: toComparativeStatementLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "manager_approve") {
      if (!access.can("comparative_statements.approve_manager", statement.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (statement.status !== "SUBMITTED") {
        return NextResponse.json(
          { error: "Manager approval requires SUBMITTED status." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.comparativeStatement.update({
          where: { id: statement.id },
          data: {
            status: "MANAGER_APPROVED",
            approvalStage: "COMMITTEE_REVIEW",
            managerApprovedAt: new Date(),
            managerApprovedById: access.userId,
            updatedById: access.userId,
          },
          include: comparativeStatementInclude,
        });

        await tx.comparativeStatementApprovalEvent.create({
          data: {
            comparativeStatementId: next.id,
            stage: "MANAGER_REVIEW",
            decision: "APPROVED",
            note: cleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["comparative_statements.approve_committee"],
          next.warehouseId,
        );
        const emailIds = await createComparativeStatementNotifications({
          tx,
          comparativeStatementId: next.id,
          stage: "MANAGER_REVIEW",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Comparative statement ${next.csNumber} passed manager approval and is waiting for Procurement Committee review.`,
          metadata: {
            status: next.status,
            stage: next.approvalStage,
            csNumber: next.csNumber,
            rfqNumber: next.rfq.rfqNumber,
          },
        });

        return { updated: next, emailNotificationIds: emailIds };
      });

      void dispatchComparativeStatementEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "approve_manager",
        entity: "comparative_statement",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Manager-approved comparative statement ${updated.csNumber}`,
        },
        before,
        after: toComparativeStatementLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "committee_approve") {
      if (!access.can("comparative_statements.approve_committee", statement.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (statement.status !== "MANAGER_APPROVED") {
        return NextResponse.json(
          { error: "Committee approval requires MANAGER_APPROVED status." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.comparativeStatement.update({
          where: { id: statement.id },
          data: {
            status: "COMMITTEE_APPROVED",
            approvalStage: "FINAL_APPROVAL",
            committeeApprovedAt: new Date(),
            committeeApprovedById: access.userId,
            updatedById: access.userId,
          },
          include: comparativeStatementInclude,
        });

        await tx.comparativeStatementApprovalEvent.create({
          data: {
            comparativeStatementId: next.id,
            stage: "COMMITTEE_REVIEW",
            decision: "APPROVED",
            note: cleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["comparative_statements.approve_final"],
          next.warehouseId,
        );
        const emailIds = await createComparativeStatementNotifications({
          tx,
          comparativeStatementId: next.id,
          stage: "COMMITTEE_REVIEW",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Comparative statement ${next.csNumber} passed committee review and is waiting for final approval as per authority matrix.`,
          metadata: {
            status: next.status,
            stage: next.approvalStage,
            csNumber: next.csNumber,
            rfqNumber: next.rfq.rfqNumber,
          },
        });

        return { updated: next, emailNotificationIds: emailIds };
      });

      void dispatchComparativeStatementEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "approve_committee",
        entity: "comparative_statement",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Committee-approved comparative statement ${updated.csNumber}`,
        },
        before,
        after: toComparativeStatementLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "final_approve") {
      const recommendedAmount = getRecommendedFinancialTotal(statement.lines);
      if (
        !passesFinalAuthorityMatrix(access, statement.warehouseId, recommendedAmount)
      ) {
        return NextResponse.json(
          {
            error:
              "Final approval denied by authority matrix. Ensure comparative final-approval plus required approval authority permissions are assigned.",
          },
          { status: 403 },
        );
      }
      if (statement.status !== "COMMITTEE_APPROVED") {
        return NextResponse.json(
          { error: "Final approval requires COMMITTEE_APPROVED status." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.comparativeStatement.update({
          where: { id: statement.id },
          data: {
            status: "FINAL_APPROVED",
            approvalStage: "FINAL_APPROVAL",
            finalApprovedAt: new Date(),
            finalApprovedById: access.userId,
            updatedById: access.userId,
          },
          include: comparativeStatementInclude,
        });

        await tx.comparativeStatementApprovalEvent.create({
          data: {
            comparativeStatementId: next.id,
            stage: "FINAL_APPROVAL",
            decision: "APPROVED",
            note: cleanText(body.note, 255) || null,
            actedById: access.userId,
            metadata: {
              recommendedAmount: recommendedAmount?.toString() ?? "0",
            },
          },
        });

        const creatorIds = [next.createdById, next.rfq.createdById].filter(
          (value): value is string => Boolean(value),
        );
        const recipients = creatorIds.length
          ? await tx.user.findMany({
              where: { id: { in: creatorIds } },
              select: { id: true, email: true },
            })
          : [];
        const emailIds = await createComparativeStatementNotifications({
          tx,
          comparativeStatementId: next.id,
          stage: "FINAL_APPROVAL",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Comparative statement ${next.csNumber} is fully approved and ready for procurement award/PO governance.`,
          metadata: {
            status: next.status,
            stage: next.approvalStage,
            csNumber: next.csNumber,
            rfqNumber: next.rfq.rfqNumber,
            recommendedAmount: recommendedAmount?.toString() ?? "0",
          },
        });

        return { updated: next, emailNotificationIds: emailIds };
      });

      void dispatchComparativeStatementEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "approve_final",
        entity: "comparative_statement",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Final-approved comparative statement ${updated.csNumber}`,
          recommendedAmount: recommendedAmount?.toString() ?? "0",
        },
        before,
        after: toComparativeStatementLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "generate_po") {
      if (!access.can("purchase_orders.manage", statement.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (statement.status !== "FINAL_APPROVED") {
        return NextResponse.json(
          { error: "PO can be generated only from FINAL_APPROVED comparative statement." },
          { status: 400 },
        );
      }
      if (statement.generatedPurchaseOrder?.id) {
        return NextResponse.json(
          {
            error: `Comparative statement ${statement.csNumber} is already linked to PO ${statement.generatedPurchaseOrder.poNumber}.`,
          },
          { status: 400 },
        );
      }

      const responsiveLines = statement.lines.filter((line) => line.isResponsive);
      if (responsiveLines.length === 0) {
        return NextResponse.json(
          { error: "No responsive supplier line found in this comparative statement." },
          { status: 400 },
        );
      }

      const rankOneLine = responsiveLines.find((line) => line.rank === 1);
      const winningLine =
        rankOneLine ??
        [...responsiveLines].sort((a, b) => {
          const totalCompare = a.financialGrandTotal.comparedTo(b.financialGrandTotal);
          if (totalCompare !== 0) return totalCompare;
          return a.id - b.id;
        })[0];

      const quotation = statement.rfq.quotations.find(
        (item) => item.id === winningLine.supplierQuotationId && item.status === "SUBMITTED",
      );
      if (!quotation) {
        return NextResponse.json(
          { error: "Winning supplier quotation is not available for PO generation." },
          { status: 400 },
        );
      }
      if (quotation.items.length === 0) {
        return NextResponse.json(
          { error: "Winning quotation has no line items." },
          { status: 400 },
        );
      }

      const expectedAtInput = body.expectedAt ? new Date(String(body.expectedAt)) : null;
      if (expectedAtInput && Number.isNaN(expectedAtInput.getTime())) {
        return NextResponse.json({ error: "Expected date is invalid." }, { status: 400 });
      }

      const { updatedStatement, createdPurchaseOrder } = await prisma.$transaction(async (tx) => {
        const existingPoByCs = await tx.purchaseOrder.findUnique({
          where: { sourceComparativeStatementId: statement.id },
          select: { id: true, poNumber: true },
        });
        if (existingPoByCs) {
          throw new Error(
            `Comparative statement ${statement.csNumber} is already linked to PO ${existingPoByCs.poNumber}.`,
          );
        }

        const existingAward = await tx.rfqAward.findUnique({
          where: { rfqId: statement.rfqId },
          select: {
            id: true,
            supplierQuotationId: true,
            purchaseOrderId: true,
          },
        });
        if (existingAward?.purchaseOrderId) {
          throw new Error("RFQ award is already converted to purchase order.");
        }
        if (
          existingAward &&
          existingAward.supplierQuotationId !== winningLine.supplierQuotationId
        ) {
          throw new Error(
            "RFQ award is linked to a different quotation. Align award decision before PO generation.",
          );
        }

        const requestedTemplateIdRaw = Number(body.termsTemplateId);
        const requestedTemplateId =
          Number.isInteger(requestedTemplateIdRaw) && requestedTemplateIdRaw > 0
            ? requestedTemplateIdRaw
            : null;
        if (
          body.termsTemplateId !== undefined &&
          body.termsTemplateId !== null &&
          body.termsTemplateId !== "" &&
          requestedTemplateId === null
        ) {
          throw new Error("Invalid terms template id.");
        }
        const selectedTemplate = await resolvePurchaseOrderTermsTemplate(tx, {
          templateId: requestedTemplateId,
          createdById: access.userId,
        });
        if (requestedTemplateId && !selectedTemplate) {
          throw new Error("Selected PO terms template is invalid or inactive.");
        }
        const customTerms = cleanText(body.termsAndConditions, 7000);
        const resolvedTerms =
          customTerms ||
          statement.rfq.termsAndConditions ||
          selectedTemplate?.body ||
          `Auto-generated from comparative statement ${statement.csNumber}.`;

        const purchaseOrderItems = quotation.items.map((item) => ({
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

        const poNumber = await generatePurchaseOrderNumber(tx);
        const createdPo = await tx.purchaseOrder.create({
          data: {
            poNumber,
            supplierId: quotation.supplierId,
            purchaseRequisitionId: statement.rfq.purchaseRequisitionId,
            sourceComparativeStatementId: statement.id,
            warehouseId: statement.warehouseId,
            status: "DRAFT",
            approvalStage: "DRAFT",
            orderDate: new Date(),
            expectedAt: expectedAtInput ?? statement.rfq.submissionDeadline ?? null,
            notes:
              cleanText(body.note, 1000) ||
              `Auto-generated from comparative statement ${statement.csNumber}.`,
            currency: quotation.currency || statement.rfq.currency,
            termsTemplateId: selectedTemplate?.id ?? null,
            termsTemplateCode: selectedTemplate?.code ?? null,
            termsTemplateName: selectedTemplate?.name ?? null,
            termsAndConditions: resolvedTerms || null,
            createdById: access.userId,
            subtotal: totals.subtotal,
            taxTotal: totals.taxTotal,
            shippingTotal: totals.shippingTotal,
            grandTotal: totals.grandTotal,
            items: {
              create: purchaseOrderItems.map((item) => ({
                productVariantId: item.productVariantId,
                description: item.description,
                quantityOrdered: item.quantityOrdered,
                unitCost: item.unitCost,
                lineTotal: item.lineTotal,
              })),
            },
          },
          include: purchaseOrderInclude,
        });

        await tx.rfqAward.upsert({
          where: { rfqId: statement.rfqId },
          create: {
            rfqId: statement.rfqId,
            supplierId: quotation.supplierId,
            supplierQuotationId: quotation.id,
            status: "CONVERTED_TO_PO",
            awardedAt: new Date(),
            awardedById: access.userId,
            purchaseOrderId: createdPo.id,
            note: `Award confirmed from CS ${statement.csNumber} and converted to PO.`,
          },
          update: {
            supplierId: quotation.supplierId,
            supplierQuotationId: quotation.id,
            status: "CONVERTED_TO_PO",
            awardedAt: new Date(),
            awardedById: access.userId,
            purchaseOrderId: createdPo.id,
            note: `Award confirmed from CS ${statement.csNumber} and converted to PO.`,
          },
        });

        await tx.rfq.update({
          where: { id: statement.rfqId },
          data: {
            status: "AWARDED",
            awardedAt: new Date(),
          },
        });

        await tx.rfqSupplierInvite.updateMany({
          where: {
            rfqId: statement.rfqId,
            supplierId: quotation.supplierId,
          },
          data: {
            status: "AWARDED",
          },
        });

        const nextStatement = await tx.comparativeStatement.findUnique({
          where: { id: statement.id },
          include: comparativeStatementInclude,
        });
        if (!nextStatement) {
          throw new Error("Comparative statement lookup failed after PO generation.");
        }

        return {
          updatedStatement: nextStatement,
          createdPurchaseOrder: createdPo,
        };
      });

      await logActivity({
        action: "generate_po",
        entity: "comparative_statement",
        entityId: updatedStatement.id,
        access,
        request,
        metadata: {
          message: `Generated purchase order ${createdPurchaseOrder.poNumber} from comparative statement ${updatedStatement.csNumber}`,
          purchaseOrderId: createdPurchaseOrder.id,
        },
        before,
        after: toComparativeStatementLogSnapshot(updatedStatement),
      });

      await logActivity({
        action: "create",
        entity: "purchase_order",
        entityId: createdPurchaseOrder.id,
        access,
        request,
        metadata: {
          message: `Created purchase order ${createdPurchaseOrder.poNumber} from comparative statement ${updatedStatement.csNumber}`,
          comparativeStatementId: updatedStatement.id,
          comparativeStatementNumber: updatedStatement.csNumber,
        },
        after: toPurchaseOrderLogSnapshot(createdPurchaseOrder),
      });

      return NextResponse.json({
        comparativeStatement: updatedStatement,
        purchaseOrder: createdPurchaseOrder,
      });
    }

    if (action === "reject") {
      const canReject =
        access.can("comparative_statements.manage", statement.warehouseId) ||
        access.can("comparative_statements.approve_manager", statement.warehouseId) ||
        access.can("comparative_statements.approve_committee", statement.warehouseId) ||
        access.can("comparative_statements.approve_final", statement.warehouseId);
      if (!canReject) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        !["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"].includes(
          statement.status,
        )
      ) {
        return NextResponse.json(
          { error: "Only in-review comparative statements can be rejected." },
          { status: 400 },
        );
      }

      const rejectionNote =
        cleanText(body.rejectionNote ?? body.note, 1000) ||
        "Comparative statement rejected.";

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.comparativeStatement.update({
          where: { id: statement.id },
          data: {
            status: "REJECTED",
            approvalStage: "REJECTION",
            rejectedAt: new Date(),
            rejectedById: access.userId,
            rejectionNote,
            updatedById: access.userId,
          },
          include: comparativeStatementInclude,
        });

        await tx.comparativeStatementApprovalEvent.create({
          data: {
            comparativeStatementId: next.id,
            stage: "REJECTION",
            decision: "REJECTED",
            note: rejectionNote,
            actedById: access.userId,
          },
        });

        const creatorIds = [next.createdById, next.rfq.createdById].filter(
          (value): value is string => Boolean(value),
        );
        const recipients = creatorIds.length
          ? await tx.user.findMany({
              where: { id: { in: creatorIds } },
              select: { id: true, email: true },
            })
          : [];
        const emailIds = await createComparativeStatementNotifications({
          tx,
          comparativeStatementId: next.id,
          stage: "REJECTION",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Comparative statement ${next.csNumber} was rejected. Note: ${rejectionNote}`,
          metadata: {
            status: next.status,
            stage: next.approvalStage,
            csNumber: next.csNumber,
            rfqNumber: next.rfq.rfqNumber,
            rejectionNote,
          },
        });

        return { updated: next, emailNotificationIds: emailIds };
      });

      void dispatchComparativeStatementEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "reject",
        entity: "comparative_statement",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Rejected comparative statement ${updated.csNumber}`,
          rejectionNote,
        },
        before,
        after: toComparativeStatementLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      if (!access.can("comparative_statements.manage", statement.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED"].includes(statement.status)) {
        return NextResponse.json(
          { error: "Only draft/submitted comparative statements can be cancelled." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.comparativeStatement.update({
          where: { id: statement.id },
          data: {
            status: "CANCELLED",
            approvalStage: "CANCELLATION",
            cancelledAt: new Date(),
            updatedById: access.userId,
            note:
              body.note !== undefined
                ? cleanText(body.note, 1000) || null
                : statement.note,
          },
          include: comparativeStatementInclude,
        });

        await tx.comparativeStatementApprovalEvent.create({
          data: {
            comparativeStatementId: next.id,
            stage: "CANCELLATION",
            decision: "CANCELLED",
            note: cleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const creatorIds = [next.createdById, next.rfq.createdById].filter(
          (value): value is string => Boolean(value),
        );
        const recipients = creatorIds.length
          ? await tx.user.findMany({
              where: { id: { in: creatorIds } },
              select: { id: true, email: true },
            })
          : [];
        const emailIds = await createComparativeStatementNotifications({
          tx,
          comparativeStatementId: next.id,
          stage: "CANCELLATION",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Comparative statement ${next.csNumber} was cancelled.`,
          metadata: {
            status: next.status,
            stage: next.approvalStage,
            csNumber: next.csNumber,
            rfqNumber: next.rfq.rfqNumber,
          },
        });

        return { updated: next, emailNotificationIds: emailIds };
      });

      void dispatchComparativeStatementEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "cancel",
        entity: "comparative_statement",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Cancelled comparative statement ${updated.csNumber}`,
        },
        before,
        after: toComparativeStatementLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM COMPARATIVE STATEMENT PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update comparative statement." },
      { status: 500 },
    );
  }
}
