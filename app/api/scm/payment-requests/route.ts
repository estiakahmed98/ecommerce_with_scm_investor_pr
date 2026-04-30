import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { generatePaymentRequestNumber, toDecimalAmount, toPaymentRequestLogSnapshot } from "@/lib/scm";

const PAYMENT_REQUEST_READ_PERMISSIONS = [
  "payment_requests.read",
  "payment_requests.manage",
  "payment_requests.approve_admin",
  "payment_requests.approve_finance",
  "payment_requests.treasury",
  "payment_reports.read",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadPaymentRequests(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...PAYMENT_REQUEST_READ_PERMISSIONS]);
}

function hasGlobalPaymentScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return PAYMENT_REQUEST_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

const paymentRequestInclude = {
  supplier: { select: { id: true, name: true, code: true, currency: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  purchaseOrder: { select: { id: true, poNumber: true, supplierId: true } },
  comparativeStatement: { select: { id: true, csNumber: true } },
  goodsReceipt: { select: { id: true, receiptNumber: true, purchaseOrderId: true } },
  supplierInvoice: { select: { id: true, invoiceNumber: true, total: true, status: true } },
  supplierPayment: { select: { id: true, paymentNumber: true, paymentDate: true, amount: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  managerApprovedBy: { select: { id: true, name: true, email: true } },
  financeApprovedBy: { select: { id: true, name: true, email: true } },
  treasuryProcessedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  cancelledBy: { select: { id: true, name: true, email: true } },
  approvalEvents: {
    include: {
      actedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ actedAt: "asc" }, { id: "asc" }],
  },
  notifications: {
    include: {
      recipientUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  },
} satisfies Prisma.PaymentRequestInclude;

type PaymentRequestBootstrapPayload = {
  capabilities: {
    canManage: boolean;
    canApproveAdmin: boolean;
    canApproveFinance: boolean;
    canTreasury: boolean;
  };
  warehouses: Array<{ id: number; name: string; code: string }>;
  suppliers: Array<{ id: number; name: string; code: string; currency: string | null }>;
  purchaseOrders: Array<{
    id: number;
    poNumber: string;
    supplierId: number;
    warehouseId: number;
  }>;
  goodsReceipts: Array<{
    id: number;
    receiptNumber: string;
    purchaseOrderId: number;
    warehouseId: number;
    supplierId: number;
  }>;
  supplierInvoices: Array<{
    id: number;
    invoiceNumber: string;
    total: Prisma.Decimal;
    status: string;
    supplierId: number;
    purchaseOrderId: number | null;
  }>;
  comparativeStatements: Array<{
    id: number;
    csNumber: string;
    warehouseId: number;
  }>;
};

async function getPaymentRequestBootstrap(
  access: Awaited<ReturnType<typeof getAccessContext>>,
): Promise<PaymentRequestBootstrapPayload> {
  const hasGlobalScope = hasGlobalPaymentScope(access);
  const canManagePaymentRequests = access.hasAny(["payment_requests.manage"]);

  const warehouseWhere =
    hasGlobalScope || access.warehouseIds.length === 0
      ? undefined
      : { id: { in: access.warehouseIds } };

  const [warehouses, purchaseOrders, goodsReceipts, supplierInvoices, comparativeStatements] =
    await Promise.all([
      prisma.warehouse.findMany({
        where: warehouseWhere,
        select: { id: true, name: true, code: true },
        orderBy: [{ name: "asc" }],
      }),
      prisma.purchaseOrder.findMany({
        where:
          hasGlobalScope || access.warehouseIds.length === 0
            ? undefined
            : { warehouseId: { in: access.warehouseIds } },
        select: {
          id: true,
          poNumber: true,
          supplierId: true,
          warehouseId: true,
        },
        orderBy: [{ orderDate: "desc" }, { id: "desc" }],
        take: 300,
      }),
      prisma.goodsReceipt.findMany({
        where:
          hasGlobalScope || access.warehouseIds.length === 0
            ? undefined
            : { warehouseId: { in: access.warehouseIds } },
        select: {
          id: true,
          receiptNumber: true,
          purchaseOrderId: true,
          warehouseId: true,
          purchaseOrder: {
            select: { supplierId: true },
          },
        },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: 300,
      }),
      prisma.supplierInvoice.findMany({
        where:
          hasGlobalScope || access.warehouseIds.length === 0
            ? undefined
            : {
                purchaseOrder: {
                  warehouseId: { in: access.warehouseIds },
                },
              },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          supplierId: true,
          purchaseOrderId: true,
        },
        orderBy: [{ issueDate: "desc" }, { id: "desc" }],
        take: 300,
      }),
      prisma.comparativeStatement.findMany({
        where:
          hasGlobalScope || access.warehouseIds.length === 0
            ? undefined
            : { warehouseId: { in: access.warehouseIds } },
        select: {
          id: true,
          csNumber: true,
          warehouseId: true,
        },
        orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
        take: 300,
      }),
    ]);

  const supplierIds = new Set<number>();
  for (const row of purchaseOrders) supplierIds.add(row.supplierId);
  for (const row of goodsReceipts) supplierIds.add(row.purchaseOrder.supplierId);
  for (const row of supplierInvoices) supplierIds.add(row.supplierId);

  const suppliers =
    (supplierIds.size === 0 && hasGlobalScope) || canManagePaymentRequests
      ? await prisma.supplier.findMany({
          where: { isActive: true },
          select: { id: true, name: true, code: true, currency: true },
          orderBy: [{ name: "asc" }],
          take: 300,
        })
      : supplierIds.size > 0
        ? await prisma.supplier.findMany({
            where: {
              id: { in: [...supplierIds] },
              isActive: true,
            },
            select: { id: true, name: true, code: true, currency: true },
            orderBy: [{ name: "asc" }],
          })
        : [];

  return {
    capabilities: {
      canManage: access.hasAny(["payment_requests.manage"]),
      canApproveAdmin: access.hasAny(["payment_requests.approve_admin"]),
      canApproveFinance: access.hasAny(["payment_requests.approve_finance"]),
      canTreasury: access.hasAny(["payment_requests.treasury"]),
    },
    warehouses,
    suppliers,
    purchaseOrders,
    goodsReceipts: goodsReceipts.map((row) => ({
      id: row.id,
      receiptNumber: row.receiptNumber,
      purchaseOrderId: row.purchaseOrderId,
      warehouseId: row.warehouseId,
      supplierId: row.purchaseOrder.supplierId,
    })),
    supplierInvoices,
    comparativeStatements,
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
    if (!canReadPaymentRequests(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (request.nextUrl.searchParams.get("bootstrap") === "true") {
      const bootstrap = await getPaymentRequestBootstrap(access);
      return NextResponse.json(bootstrap);
    }

    const status = toCleanText(request.nextUrl.searchParams.get("status"), 40).toUpperCase();
    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const search = toCleanText(request.nextUrl.searchParams.get("search"), 120);
    const myOnly = request.nextUrl.searchParams.get("mine") === "true";

    const where: Prisma.PaymentRequestWhereInput = {};
    if (status) {
      where.status = status as any;
    }
    if (Number.isInteger(supplierId) && supplierId > 0) {
      where.supplierId = supplierId;
    }
    if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json([]);
      }
      where.warehouseId = warehouseId;
    }

    if (search) {
      where.OR = [
        { prfNumber: { contains: search, mode: "insensitive" } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
        { supplier: { code: { contains: search, mode: "insensitive" } } },
        { supplierInvoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
      ];
    }

    const hasGlobalScope = hasGlobalPaymentScope(access);
    if (!hasGlobalScope) {
      if (myOnly) {
        where.createdById = access.userId;
      } else if (access.warehouseIds.length > 0) {
        where.OR = [
          ...(where.OR ?? []),
          { createdById: access.userId },
          { warehouseId: { in: access.warehouseIds } },
        ];
      } else {
        where.createdById = access.userId;
      }
    } else if (myOnly) {
      where.createdById = access.userId;
    }

    const requests = await prisma.paymentRequest.findMany({
      where,
      include: paymentRequestInclude,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      take: 400,
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("PAYMENT REQUEST GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load payment requests." }, { status: 500 });
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
    if (!access.hasAny(["payment_requests.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      supplierId?: unknown;
      warehouseId?: unknown;
      purchaseOrderId?: unknown;
      comparativeStatementId?: unknown;
      goodsReceiptId?: unknown;
      supplierInvoiceId?: unknown;
      amount?: unknown;
      currency?: unknown;
      note?: unknown;
      referenceNumber?: unknown;
    };

    const supplierIdRaw = Number(body.supplierId || "");
    const warehouseId =
      body.warehouseId === null || body.warehouseId === undefined || body.warehouseId === ""
        ? null
        : Number(body.warehouseId);
    const purchaseOrderId =
      body.purchaseOrderId === null || body.purchaseOrderId === undefined || body.purchaseOrderId === ""
        ? null
        : Number(body.purchaseOrderId);
    const comparativeStatementId =
      body.comparativeStatementId === null || body.comparativeStatementId === undefined || body.comparativeStatementId === ""
        ? null
        : Number(body.comparativeStatementId);
    const goodsReceiptId =
      body.goodsReceiptId === null || body.goodsReceiptId === undefined || body.goodsReceiptId === ""
        ? null
        : Number(body.goodsReceiptId);
    const supplierInvoiceId =
      body.supplierInvoiceId === null || body.supplierInvoiceId === undefined || body.supplierInvoiceId === ""
        ? null
        : Number(body.supplierInvoiceId);

    if (warehouseId && (!Number.isInteger(warehouseId) || warehouseId <= 0)) {
      return NextResponse.json({ error: "Invalid warehouse." }, { status: 400 });
    }
    if (warehouseId && !access.canAccessWarehouse(warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [supplierFromInvoice, purchaseOrder, goodsReceipt, supplierRecord] = await Promise.all([
      supplierInvoiceId
        ? prisma.supplierInvoice.findUnique({
            where: { id: supplierInvoiceId },
            include: {
              payments: { select: { amount: true } },
              ledgerEntries: {
                where: { entryType: "ADJUSTMENT", direction: "CREDIT" },
                select: { amount: true },
              },
              purchaseOrder: { select: { id: true, supplierId: true } },
            },
          })
        : Promise.resolve(null),
      purchaseOrderId
        ? prisma.purchaseOrder.findUnique({
            where: { id: purchaseOrderId },
            select: { id: true, supplierId: true, warehouseId: true },
          })
        : Promise.resolve(null),
      goodsReceiptId
        ? prisma.goodsReceipt.findUnique({
            where: { id: goodsReceiptId },
            select: { id: true, purchaseOrderId: true, warehouseId: true, purchaseOrder: { select: { supplierId: true } } },
          })
        : Promise.resolve(null),
      supplierIdRaw
        ? prisma.supplier.findUnique({
            where: { id: supplierIdRaw },
            select: { id: true, currency: true },
          })
        : Promise.resolve(null),
    ]);

    const resolvedSupplierId =
      supplierFromInvoice?.supplierId ||
      purchaseOrder?.supplierId ||
      goodsReceipt?.purchaseOrder?.supplierId ||
      supplierIdRaw;

    if (!Number.isInteger(resolvedSupplierId) || resolvedSupplierId <= 0) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }
    if (supplierRecord && supplierRecord.id !== resolvedSupplierId) {
      return NextResponse.json({ error: "Supplier mismatch in request." }, { status: 400 });
    }

    if (supplierFromInvoice && supplierFromInvoice.supplierId !== resolvedSupplierId) {
      return NextResponse.json({ error: "Invoice supplier mismatch." }, { status: 400 });
    }
    if (purchaseOrder && purchaseOrder.supplierId !== resolvedSupplierId) {
      return NextResponse.json({ error: "Purchase order supplier mismatch." }, { status: 400 });
    }
    if (goodsReceipt && goodsReceipt.purchaseOrder?.supplierId !== resolvedSupplierId) {
      return NextResponse.json({ error: "Goods receipt supplier mismatch." }, { status: 400 });
    }

    const amountInput =
      body.amount === null || body.amount === undefined || body.amount === ""
        ? null
        : toDecimalAmount(body.amount, "Amount");

    let amount = amountInput;
    if (supplierFromInvoice) {
      const paidSoFar = supplierFromInvoice.payments.reduce(
        (sum, item) => sum.plus(item.amount),
        new Prisma.Decimal(0),
      );
      const adjustmentCredit = supplierFromInvoice.ledgerEntries.reduce(
        (sum, entry) => sum.plus(entry.amount),
        new Prisma.Decimal(0),
      );
      const outstanding = supplierFromInvoice.total.minus(paidSoFar).minus(adjustmentCredit);
      if (!amount) {
        amount = outstanding;
      }
      if (amount && amount.gt(outstanding)) {
        return NextResponse.json({ error: "Payment amount exceeds invoice outstanding." }, { status: 400 });
      }
    }

    if (!amount || amount.lte(0)) {
      return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const prfNumber = await generatePaymentRequestNumber(tx);
      const requestRow = await tx.paymentRequest.create({
        data: {
          prfNumber,
          supplierId: resolvedSupplierId,
          warehouseId: warehouseId ?? purchaseOrder?.warehouseId ?? goodsReceipt?.warehouseId ?? null,
          purchaseOrderId: purchaseOrder?.id ?? supplierFromInvoice?.purchaseOrderId ?? goodsReceipt?.purchaseOrderId ?? null,
          comparativeStatementId: comparativeStatementId ?? null,
          goodsReceiptId: goodsReceiptId ?? null,
          supplierInvoiceId: supplierInvoiceId ?? null,
          amount,
          currency: toCleanText(body.currency, 3).toUpperCase() || supplierRecord?.currency || "BDT",
          note: toCleanText(body.note, 500) || null,
          referenceNumber: toCleanText(body.referenceNumber, 120) || null,
          createdById: access.userId,
        },
        include: paymentRequestInclude,
      });

      await tx.paymentRequestApprovalEvent.create({
        data: {
          paymentRequestId: requestRow.id,
          stage: "DRAFT",
          decision: "APPROVED",
          note: "Draft created",
          actedById: access.userId,
        },
      });

      return requestRow;
    });

    await logActivity({
      action: "create",
      entity: "payment_request",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created payment request ${created.prfNumber}`,
      },
      after: toPaymentRequestLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("PAYMENT REQUEST POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create payment request." },
      { status: 500 },
    );
  }
}
