import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  comparativeStatementInclude,
  generateComparativeStatementNumber,
  rfqInclude,
  toComparativeStatementLogSnapshot,
} from "@/lib/scm";
import {
  computeComparativeScores,
  normalizeWeightInput,
  resolveWeightPair,
} from "@/lib/comparative-statements";

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

function buildWarehouseScopedWhere(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  requestedWarehouseId: number | null,
): Prisma.ComparativeStatementWhereInput | null {
  if (hasGlobalComparativeStatementScope(access)) {
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

function isBlindReviewActive(rfq: {
  status: string;
  submissionDeadline: Date | null;
}) {
  if (!rfq.submissionDeadline) return false;
  if (rfq.status === "DRAFT" || rfq.status === "CANCELLED") return false;
  return Date.now() < rfq.submissionDeadline.getTime();
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
    if (!canReadComparativeStatements(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const rfqId = Number(request.nextUrl.searchParams.get("rfqId") || "");

    const warehouseFilter = buildWarehouseScopedWhere(
      access,
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
    );
    if (warehouseFilter === null) {
      return NextResponse.json([]);
    }

    const filters: Prisma.ComparativeStatementWhereInput[] = [warehouseFilter];
    if (status) {
      filters.push({
        status: status as Prisma.EnumComparativeStatementStatusFilter["equals"],
      });
    }
    if (Number.isInteger(rfqId) && rfqId > 0) {
      filters.push({ rfqId });
    }
    if (search) {
      filters.push({
        OR: [
          { csNumber: { contains: search, mode: "insensitive" } },
          { rfq: { rfqNumber: { contains: search, mode: "insensitive" } } },
          { warehouse: { name: { contains: search, mode: "insensitive" } } },
          {
            lines: {
              some: {
                supplier: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
            },
          },
        ],
      });
    }

    const rows = await prisma.comparativeStatement.findMany({
      where: filters.length === 1 ? filters[0] : { AND: filters },
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      include: comparativeStatementInclude,
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error("SCM COMPARATIVE STATEMENTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load comparative statements." },
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
      rfqId?: unknown;
      note?: unknown;
      technicalWeight?: unknown;
      financialWeight?: unknown;
    };
    const rfqId = Number(body.rfqId);
    if (!Number.isInteger(rfqId) || rfqId <= 0) {
      return NextResponse.json({ error: "RFQ is required." }, { status: 400 });
    }

    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      include: rfqInclude,
    });
    if (!rfq) {
      return NextResponse.json({ error: "RFQ not found." }, { status: 404 });
    }
    if (!access.can("comparative_statements.manage", rfq.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["SUBMITTED", "CLOSED", "AWARDED"].includes(rfq.status)) {
      return NextResponse.json(
        {
          error:
            "Comparative statement can be generated only after RFQ submission (SUBMITTED/CLOSED/AWARDED).",
        },
        { status: 400 },
      );
    }
    if (isBlindReviewActive(rfq)) {
      return NextResponse.json(
        {
          error:
            "Blind review is active. Comparative statement generation unlocks after RFQ deadline.",
        },
        { status: 400 },
      );
    }

    const activeCs = await prisma.comparativeStatement.findFirst({
      where: {
        rfqId: rfq.id,
        status: {
          in: [
            "DRAFT",
            "SUBMITTED",
            "MANAGER_APPROVED",
            "COMMITTEE_APPROVED",
          ],
        },
      },
      select: { id: true, csNumber: true, status: true },
    });
    if (activeCs) {
      return NextResponse.json(
        {
          error: `Active comparative statement ${activeCs.csNumber} (${activeCs.status}) already exists for this RFQ.`,
        },
        { status: 400 },
      );
    }

    const candidateQuotations = rfq.quotations.filter(
      (quotation) => quotation.status === "SUBMITTED",
    );
    if (candidateQuotations.length === 0) {
      return NextResponse.json(
        {
          error:
            "No submitted financial proposals were found for this RFQ. Invite and collect quotations first.",
        },
        { status: 400 },
      );
    }

    const { technicalWeight, financialWeight } = resolveWeightPair({
      technicalWeight: normalizeWeightInput(body.technicalWeight, "Technical weight"),
      financialWeight: normalizeWeightInput(body.financialWeight, "Financial weight"),
    });

    const created = await prisma.$transaction(async (tx) => {
      const csNumber = await generateComparativeStatementNumber(tx);
      const latest = await tx.comparativeStatement.findFirst({
        where: { rfqId: rfq.id },
        orderBy: { versionNo: "desc" },
        select: { versionNo: true },
      });
      const versionNo = (latest?.versionNo ?? 0) + 1;

      const scoreInputs = candidateQuotations.map((quotation) => ({
        id: quotation.id,
        financialGrandTotal: quotation.total,
        technicalScore: new Prisma.Decimal(0),
        isResponsive: true,
      }));
      const scored = computeComparativeScores(
        scoreInputs,
        technicalWeight,
        financialWeight,
      );
      const byQuotationId = new Map(scored.map((line) => [line.id, line]));

      const next = await tx.comparativeStatement.create({
        data: {
          csNumber,
          rfqId: rfq.id,
          warehouseId: rfq.warehouseId,
          versionNo,
          status: "DRAFT",
          approvalStage: "DRAFT",
          technicalWeight,
          financialWeight,
          note: cleanText(body.note, 1000) || null,
          sourceQuotationSnapshot: {
            rfqNumber: rfq.rfqNumber,
            rfqSubmissionDeadline: rfq.submissionDeadline?.toISOString() ?? null,
            generatedFromRound: rfq.resubmissionRound,
            quotationCount: candidateQuotations.length,
            quotations: candidateQuotations.map((quotation) => ({
              quotationId: quotation.id,
              supplierId: quotation.supplierId,
              supplierCode: quotation.supplier.code,
              supplierName: quotation.supplier.name,
              revisionNo: quotation.revisionNo,
              quotedAt: quotation.quotedAt.toISOString(),
              currency: quotation.currency,
              subtotal: quotation.subtotal.toString(),
              taxTotal: quotation.taxTotal.toString(),
              total: quotation.total.toString(),
            })),
          } as Prisma.InputJsonValue,
          createdById: access.userId,
          updatedById: access.userId,
          lines: {
            create: candidateQuotations.map((quotation) => {
              const score = byQuotationId.get(quotation.id);
              if (!score) {
                throw new Error("Failed to compute comparative score snapshot.");
              }
              return {
                supplierQuotationId: quotation.id,
                supplierId: quotation.supplierId,
                financialSubtotal: quotation.subtotal,
                financialTaxTotal: quotation.taxTotal,
                financialGrandTotal: quotation.total,
                currency: quotation.currency,
                technicalScore: score.technicalScore,
                financialScore: score.financialScore,
                combinedScore: score.combinedScore,
                rank: score.rank,
                isResponsive: true,
              };
            }),
          },
          approvalEvents: {
            create: {
              stage: "DRAFT",
              decision: "SUBMITTED",
              note: "Auto-generated from RFQ submitted quotations.",
              actedById: access.userId,
              metadata: {
                source: "RFQ_FINANCIAL_EXTRACTION",
                rfqId: rfq.id,
                rfqNumber: rfq.rfqNumber,
              },
            },
          },
        },
        include: comparativeStatementInclude,
      });

      return next;
    });

    await logActivity({
      action: "create",
      entity: "comparative_statement",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Generated comparative statement ${created.csNumber} from RFQ ${created.rfq.rfqNumber}`,
        rfqId: created.rfqId,
        rfqNumber: created.rfq.rfqNumber,
        versionNo: created.versionNo,
      },
      after: toComparativeStatementLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM COMPARATIVE STATEMENTS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate comparative statement." },
      { status: 500 },
    );
  }
}

