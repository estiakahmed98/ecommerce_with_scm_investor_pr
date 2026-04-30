import { prisma } from "@/lib/prisma";

type DateRangeInput = {
  from?: string | null;
  to?: string | null;
};

export type ScmExportSection =
  | "pipeline"
  | "vendors"
  | "rfqs"
  | "comparative"
  | "purchase-orders"
  | "grn-stock"
  | "payments"
  | "audit"
  | "projects"
  | "budgets"
  | "plans"
  | "mrf";

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback;
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function buildDateRange(input: DateRangeInput) {
  const now = new Date();
  const fallbackFrom = addDays(now, -29);
  const fromDate = startOfDay(parseDateValue(input.from, fallbackFrom));
  const toDate = startOfDay(parseDateValue(input.to, now));
  const toExclusive = addDays(toDate, 1);

  if (toExclusive <= fromDate) {
    return {
      from: fromDate,
      to: addDays(fromDate, 1),
      fromLabel: formatDateKey(fromDate),
      toLabel: formatDateKey(fromDate),
    };
  }

  return {
    from: fromDate,
    to: toExclusive,
    fromLabel: formatDateKey(fromDate),
    toLabel: formatDateKey(addDays(toExclusive, -1)),
  };
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[\",\\n]/.test(text)) {
    return `\"${text.replace(/\"/g, '\"\"')}\"`;
  }
  return text;
}

function makeCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
}

function mapStatusCounts(rows: Array<{ status: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count);
}

function resolveProjectPlanKey(input: {
  planningNote?: string | null;
  title?: string | null;
  purpose?: string | null;
  warehouseName?: string | null;
}) {
  const planningNote = input.planningNote?.trim();
  if (planningNote) return planningNote;
  const title = input.title?.trim();
  if (title) return title;
  const purpose = input.purpose?.trim();
  if (purpose) return purpose;
  const warehouseName = input.warehouseName?.trim();
  if (warehouseName) return `${warehouseName} plan`;
  return "Unspecified Plan";
}

export async function getScmDashboardOverview(input: DateRangeInput = {}) {
  const range = buildDateRange(input);
  const createdAtWhere = {
    gte: range.from,
    lt: range.to,
  };

  const latestInventorySnapshot = await prisma.inventoryDailySnapshot.findFirst({
    orderBy: [{ snapshotDate: "desc" }, { id: "desc" }],
    select: { snapshotDate: true },
  });

  const [
    requisitions,
    rfqs,
    comparativeStatements,
    purchaseOrders,
    goodsReceipts,
    supplierInvoices,
    paymentRequests,
    supplierPayments,
    receiptEvaluations,
    supplierReturns,
    inventorySnapshots,
    activityLogs,
  ] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where: { requestedAt: createdAtWhere },
      orderBy: { requestedAt: "desc" },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        assignedProcurementOfficer: {
          select: { id: true, name: true, email: true },
        },
        rfqs: {
          select: { id: true, status: true },
        },
        purchaseOrders: {
          select: {
            id: true,
            status: true,
            grandTotal: true,
            supplierInvoices: {
              select: {
                id: true,
                total: true,
                payments: {
                  select: { id: true, amount: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.rfq.findMany({
      where: { requestedAt: createdAtWhere },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        rfqNumber: true,
        status: true,
        requestedAt: true,
        submissionDeadline: true,
        warehouse: { select: { id: true, name: true, code: true } },
        _count: {
          select: { supplierInvites: true, quotations: true },
        },
        award: {
          select: {
            id: true,
            supplierId: true,
            supplier: { select: { id: true, name: true, code: true } },
            purchaseOrderId: true,
          },
        },
      },
    }),
    prisma.comparativeStatement.findMany({
      where: { generatedAt: createdAtWhere },
      orderBy: { generatedAt: "desc" },
      select: {
        id: true,
        csNumber: true,
        status: true,
        approvalStage: true,
        generatedAt: true,
        warehouse: { select: { id: true, name: true, code: true } },
        rfq: { select: { id: true, rfqNumber: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { orderDate: createdAtWhere },
      orderBy: { orderDate: "desc" },
      select: {
        id: true,
        poNumber: true,
        status: true,
        approvalStage: true,
        orderDate: true,
        expectedAt: true,
        grandTotal: true,
        warehouse: { select: { id: true, name: true, code: true } },
        supplier: { select: { id: true, name: true, code: true } },
        purchaseRequisition: {
          select: {
            id: true,
            requisitionNumber: true,
            budgetCode: true,
            planningNote: true,
            title: true,
            purpose: true,
          },
        },
      },
    }),
    prisma.goodsReceipt.findMany({
      where: { receivedAt: createdAtWhere },
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        receivedAt: true,
        requesterConfirmedAt: true,
        warehouse: { select: { id: true, name: true, code: true } },
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            supplier: { select: { id: true, name: true, code: true } },
          },
        },
        items: {
          select: {
            quantityReceived: true,
          },
        },
      },
    }),
    prisma.supplierInvoice.findMany({
      where: { issueDate: createdAtWhere },
      orderBy: { issueDate: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        matchStatus: true,
        issueDate: true,
        total: true,
        supplier: { select: { id: true, name: true, code: true } },
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            purchaseRequisition: {
              select: { budgetCode: true, planningNote: true, title: true, purpose: true },
            },
          },
        },
      },
    }),
    prisma.paymentRequest.findMany({
      where: { requestedAt: createdAtWhere },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        prfNumber: true,
        status: true,
        approvalStage: true,
        amount: true,
        requestedAt: true,
        paidAt: true,
        supplier: { select: { id: true, name: true, code: true } },
        supplierInvoice: { select: { id: true, invoiceNumber: true } },
      },
    }),
    prisma.supplierPayment.findMany({
      where: { paymentDate: createdAtWhere },
      orderBy: { paymentDate: "desc" },
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        method: true,
        supplier: { select: { id: true, name: true, code: true } },
        supplierInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            purchaseOrder: {
              select: {
                purchaseRequisition: {
                  select: { budgetCode: true, planningNote: true, title: true, purpose: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.goodsReceiptVendorEvaluation.findMany({
      where: { createdAt: createdAtWhere },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        overallRating: true,
        evaluatorRole: true,
        createdAt: true,
        goodsReceipt: {
          select: {
            receiptNumber: true,
            purchaseOrder: {
              select: {
                supplier: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
      },
    }),
    prisma.supplierReturn.findMany({
      where: { requestedAt: createdAtWhere },
      orderBy: { requestedAt: "desc" },
      select: {
        id: true,
        status: true,
        requestedAt: true,
        supplier: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.inventoryDailySnapshot.findMany({
      where: latestInventorySnapshot
        ? {
            snapshotDate: latestInventorySnapshot.snapshotDate,
            warehouseId: { not: null },
          }
        : undefined,
      select: {
        id: true,
        variantId: true,
        stock: true,
        status: true,
        lowStockThreshold: true,
        variant: {
          select: {
            sku: true,
            product: { select: { name: true } },
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      take: 500,
    }),
    prisma.activityLog.findMany({
      where: {
        createdAt: createdAtWhere,
        OR: [
          { entity: { startsWith: "supplier_" } },
          { entity: { startsWith: "purchase_requisition" } },
          { entity: { startsWith: "rfq" } },
          { entity: { startsWith: "comparative_statement" } },
          { entity: { startsWith: "purchase_order" } },
          { entity: { startsWith: "goods_receipt" } },
          { entity: { startsWith: "supplier_invoice" } },
          { entity: { startsWith: "supplier_payment" } },
          { entity: { startsWith: "supplier_return" } },
          { entity: { startsWith: "replenishment" } },
          { entity: { startsWith: "warehouse_transfer" } },
          { entity: { startsWith: "material_request" } },
          { entity: { startsWith: "material_release" } },
          { entity: { startsWith: "asset_register" } },
          { entity: { startsWith: "warehouse_location" } },
          { entity: { startsWith: "sla" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      take: 200,
    }),
  ]);

  const requisitionStatusCounts = mapStatusCounts(requisitions);
  const rfqStatusCounts = mapStatusCounts(rfqs);
  const csStatusCounts = mapStatusCounts(comparativeStatements);
  const poStatusCounts = mapStatusCounts(purchaseOrders);
  const grnStatusCounts = mapStatusCounts(goodsReceipts);
  const invoiceStatusCounts = mapStatusCounts(supplierInvoices);
  const prfStatusCounts = mapStatusCounts(paymentRequests);

  const lowStockRows = inventorySnapshots
    .filter((row) => row.status !== "IN_STOCK")
    .sort((left, right) => left.stock - right.stock)
    .slice(0, 10)
    .map((row) => ({
      variantId: row.variantId,
      sku: row.variant.sku,
      productName: row.variant.product.name,
      stock: row.stock,
      status: row.status,
      lowStockThreshold: row.lowStockThreshold,
      warehouse: row.warehouse,
    }));

  const vendorMap = new Map<
    number,
    {
      supplierId: number;
      supplierName: string;
      supplierCode: string;
      evaluations: number;
      averageRating: number;
      returns: number;
      awards: number;
      payments: number;
    }
  >();

  for (const row of receiptEvaluations) {
    const supplier = row.goodsReceipt.purchaseOrder.supplier;
    const current = vendorMap.get(supplier.id) ?? {
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      evaluations: 0,
      averageRating: 0,
      returns: 0,
      awards: 0,
      payments: 0,
    };
    current.evaluations += 1;
    current.averageRating += asNumber(row.overallRating);
    vendorMap.set(supplier.id, current);
  }

  for (const row of supplierReturns) {
    const current = vendorMap.get(row.supplier.id) ?? {
      supplierId: row.supplier.id,
      supplierName: row.supplier.name,
      supplierCode: row.supplier.code,
      evaluations: 0,
      averageRating: 0,
      returns: 0,
      awards: 0,
      payments: 0,
    };
    current.returns += 1;
    vendorMap.set(row.supplier.id, current);
  }

  for (const row of rfqs) {
    if (!row.award?.supplier) continue;
    const supplier = row.award.supplier;
    const current = vendorMap.get(supplier.id) ?? {
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      evaluations: 0,
      averageRating: 0,
      returns: 0,
      awards: 0,
      payments: 0,
    };
    current.awards += 1;
    vendorMap.set(supplier.id, current);
  }

  for (const row of supplierPayments) {
    const current = vendorMap.get(row.supplier.id) ?? {
      supplierId: row.supplier.id,
      supplierName: row.supplier.name,
      supplierCode: row.supplier.code,
      evaluations: 0,
      averageRating: 0,
      returns: 0,
      awards: 0,
      payments: 0,
    };
    current.payments = roundMoney(current.payments + asNumber(row.amount));
    vendorMap.set(row.supplier.id, current);
  }

  const topVendors = Array.from(vendorMap.values())
    .map((row) => ({
      ...row,
      averageRating:
        row.evaluations > 0 ? roundMoney(row.averageRating / row.evaluations) : 0,
    }))
    .sort((left, right) => {
      if (right.evaluations !== left.evaluations) {
        return right.evaluations - left.evaluations;
      }
      return right.averageRating - left.averageRating;
    })
    .slice(0, 10);

  const projectPlanMap = new Map<
    string,
    {
      projectPlan: string;
      requisitions: number;
      approvedRequisitions: number;
      convertedRequisitions: number;
      rfqs: number;
      purchaseOrders: number;
      orderedAmount: number;
      invoicedAmount: number;
      paidAmount: number;
    }
  >();

  const budgetMap = new Map<
    string,
    {
      budgetCode: string;
      requisitions: number;
      approvedRequisitions: number;
      estimatedAmount: number;
      purchaseOrders: number;
      orderedAmount: number;
      invoicedAmount: number;
      paidAmount: number;
    }
  >();

  for (const requisition of requisitions) {
    const projectPlan = resolveProjectPlanKey({
      planningNote: requisition.planningNote,
      title: requisition.title,
      purpose: requisition.purpose,
      warehouseName: requisition.warehouse.name,
    });
    const projectCurrent = projectPlanMap.get(projectPlan) ?? {
      projectPlan,
      requisitions: 0,
      approvedRequisitions: 0,
      convertedRequisitions: 0,
      rfqs: 0,
      purchaseOrders: 0,
      orderedAmount: 0,
      invoicedAmount: 0,
      paidAmount: 0,
    };
    projectCurrent.requisitions += 1;
    if (
      ["APPROVED", "CONVERTED", "ROUTED_TO_PROCUREMENT"].includes(requisition.status)
    ) {
      projectCurrent.approvedRequisitions += 1;
    }
    if (["CONVERTED", "ROUTED_TO_PROCUREMENT"].includes(requisition.status)) {
      projectCurrent.convertedRequisitions += 1;
    }
    projectCurrent.rfqs += requisition.rfqs.length;
    projectCurrent.purchaseOrders += requisition.purchaseOrders.length;

    for (const purchaseOrder of requisition.purchaseOrders) {
      projectCurrent.orderedAmount = roundMoney(
        projectCurrent.orderedAmount + asNumber(purchaseOrder.grandTotal),
      );
      for (const invoice of purchaseOrder.supplierInvoices) {
        projectCurrent.invoicedAmount = roundMoney(
          projectCurrent.invoicedAmount + asNumber(invoice.total),
        );
        for (const payment of invoice.payments) {
          projectCurrent.paidAmount = roundMoney(
            projectCurrent.paidAmount + asNumber(payment.amount),
          );
        }
      }
    }
    projectPlanMap.set(projectPlan, projectCurrent);

    if (!requisition.budgetCode?.trim()) continue;
    const budgetCode = requisition.budgetCode.trim();
    const budgetCurrent = budgetMap.get(budgetCode) ?? {
      budgetCode,
      requisitions: 0,
      approvedRequisitions: 0,
      estimatedAmount: 0,
      purchaseOrders: 0,
      orderedAmount: 0,
      invoicedAmount: 0,
      paidAmount: 0,
    };
    budgetCurrent.requisitions += 1;
    if (
      ["APPROVED", "CONVERTED", "ROUTED_TO_PROCUREMENT"].includes(requisition.status)
    ) {
      budgetCurrent.approvedRequisitions += 1;
    }
    budgetCurrent.estimatedAmount = roundMoney(
      budgetCurrent.estimatedAmount + asNumber(requisition.estimatedAmount),
    );
    budgetCurrent.purchaseOrders += requisition.purchaseOrders.length;
    for (const purchaseOrder of requisition.purchaseOrders) {
      budgetCurrent.orderedAmount = roundMoney(
        budgetCurrent.orderedAmount + asNumber(purchaseOrder.grandTotal),
      );
      for (const invoice of purchaseOrder.supplierInvoices) {
        budgetCurrent.invoicedAmount = roundMoney(
          budgetCurrent.invoicedAmount + asNumber(invoice.total),
        );
        for (const payment of invoice.payments) {
          budgetCurrent.paidAmount = roundMoney(
            budgetCurrent.paidAmount + asNumber(payment.amount),
          );
        }
      }
    }
    budgetMap.set(budgetCode, budgetCurrent);
  }

  const totalSupplierPayments = supplierPayments.reduce(
    (sum, row) => roundMoney(sum + asNumber(row.amount)),
    0,
  );
  const totalPaymentRequests = paymentRequests.reduce(
    (sum, row) => roundMoney(sum + asNumber(row.amount)),
    0,
  );
  const totalOrderedAmount = purchaseOrders.reduce(
    (sum, row) => roundMoney(sum + asNumber(row.grandTotal)),
    0,
  );
  const totalInvoicedAmount = supplierInvoices.reduce(
    (sum, row) => roundMoney(sum + asNumber(row.total)),
    0,
  );

  const auditEntityCounts = mapStatusCounts(
    activityLogs.map((row) => ({ status: row.entity })),
  ).map((row) => ({ entity: row.status, count: row.count }));

  const pendingRequisitionApprovals = requisitions.filter((row) =>
    ["SUBMITTED", "BUDGET_CLEARED", "ENDORSED"].includes(row.status),
  ).length;
  const pendingComparativeApprovals = comparativeStatements.filter((row) =>
    ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"].includes(row.status),
  ).length;
  const pendingPoApprovals = purchaseOrders.filter((row) =>
    ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"].includes(row.status),
  ).length;
  const pendingPrfApprovals = paymentRequests.filter((row) =>
    ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(
      row.status,
    ),
  ).length;

  return {
    filters: {
      from: range.fromLabel,
      to: range.toLabel,
    },
    overview: {
      requisitions: requisitions.length,
      rfqs: rfqs.length,
      comparativeStatements: comparativeStatements.length,
      purchaseOrders: purchaseOrders.length,
      goodsReceipts: goodsReceipts.length,
      supplierInvoices: supplierInvoices.length,
      paymentRequests: paymentRequests.length,
      supplierPayments: supplierPayments.length,
      lowStockVariants: lowStockRows.length,
      auditEvents: activityLogs.length,
      totalOrderedAmount,
      totalInvoicedAmount,
      totalPaymentRequests,
      totalSupplierPayments,
      pendingApprovals:
        pendingRequisitionApprovals +
        pendingComparativeApprovals +
        pendingPoApprovals +
        pendingPrfApprovals,
    },
    procurementPipeline: {
      requisitions: requisitionStatusCounts,
      rfqs: rfqStatusCounts,
      comparativeStatements: csStatusCounts,
      purchaseOrders: poStatusCounts,
      goodsReceipts: grnStatusCounts,
      supplierInvoices: invoiceStatusCounts,
      paymentRequests: prfStatusCounts,
    },
    vendorPerformance: {
      topSuppliers: topVendors,
      evaluationCount: receiptEvaluations.length,
      supplierReturnCount: supplierReturns.length,
    },
    rfqStatus: {
      counts: rfqStatusCounts,
      rows: rfqs.slice(0, 10).map((row) => ({
        id: row.id,
        rfqNumber: row.rfqNumber,
        status: row.status,
        requestedAt: row.requestedAt.toISOString(),
        submissionDeadline: row.submissionDeadline?.toISOString() ?? null,
        warehouseName: row.warehouse.name,
        warehouseCode: row.warehouse.code,
        inviteCount: row._count.supplierInvites,
        quotationCount: row._count.quotations,
        awardedSupplier: row.award?.supplier?.name ?? null,
      })),
    },
    comparativeStatementSummary: {
      counts: csStatusCounts,
      rows: comparativeStatements.slice(0, 10).map((row) => ({
        id: row.id,
        csNumber: row.csNumber,
        status: row.status,
        approvalStage: row.approvalStage,
        generatedAt: row.generatedAt.toISOString(),
        warehouseName: row.warehouse.name,
        warehouseCode: row.warehouse.code,
        rfqNumber: row.rfq.rfqNumber,
      })),
    },
    purchaseOrderTracking: {
      counts: poStatusCounts,
      rows: purchaseOrders.slice(0, 10).map((row) => ({
        id: row.id,
        poNumber: row.poNumber,
        status: row.status,
        approvalStage: row.approvalStage,
        orderDate: row.orderDate.toISOString(),
        expectedAt: row.expectedAt?.toISOString() ?? null,
        warehouseName: row.warehouse.name,
        warehouseCode: row.warehouse.code,
        supplierName: row.supplier.name,
        grandTotal: asNumber(row.grandTotal),
      })),
    },
    grnStockSummary: {
      counts: grnStatusCounts,
      pendingRequesterConfirmation: goodsReceipts.filter(
        (row) => row.requesterConfirmedAt === null,
      ).length,
      latestSnapshotDate: latestInventorySnapshot?.snapshotDate.toISOString() ?? null,
      lowStockCount: lowStockRows.length,
      rows: goodsReceipts.slice(0, 10).map((row) => ({
        id: row.id,
        receiptNumber: row.receiptNumber,
        status: row.status,
        receivedAt: row.receivedAt.toISOString(),
        requesterConfirmedAt: row.requesterConfirmedAt?.toISOString() ?? null,
        warehouseName: row.warehouse.name,
        supplierName: row.purchaseOrder.supplier.name,
        quantityReceived: row.items.reduce((sum, item) => sum + item.quantityReceived, 0),
      })),
      lowStockRows,
    },
    paymentSummary: {
      prfCounts: prfStatusCounts,
      totalRequestedAmount: totalPaymentRequests,
      totalPaidAmount: totalSupplierPayments,
      rows: paymentRequests.slice(0, 10).map((row) => ({
        id: row.id,
        prfNumber: row.prfNumber,
        status: row.status,
        approvalStage: row.approvalStage,
        requestedAt: row.requestedAt.toISOString(),
        paidAt: row.paidAt?.toISOString() ?? null,
        supplierName: row.supplier.name,
        amount: asNumber(row.amount),
        invoiceNumber: row.supplierInvoice?.invoiceNumber ?? null,
      })),
      recentPayments: supplierPayments.slice(0, 10).map((row) => ({
        id: row.id,
        paymentNumber: row.paymentNumber,
        paymentDate: row.paymentDate.toISOString(),
        supplierName: row.supplier.name,
        amount: asNumber(row.amount),
        method: row.method,
        invoiceNumber: row.supplierInvoice?.invoiceNumber ?? null,
      })),
    },
    auditSummary: {
      totalEvents: activityLogs.length,
      entityBreakdown: auditEntityCounts.slice(0, 10),
      recentEvents: activityLogs.slice(0, 12).map((row) => ({
        id: row.id.toString(),
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
        actorName: row.user?.name ?? row.user?.email ?? "System",
      })),
    },
    projectProcurementSummary: Array.from(projectPlanMap.values())
      .sort((left, right) => right.orderedAmount - left.orderedAmount)
      .slice(0, 20),
    budgetVsProcurement: Array.from(budgetMap.values())
      .sort((left, right) => right.orderedAmount - left.orderedAmount)
      .slice(0, 20)
      .map((row) => ({
        ...row,
        remainingBudgetGap: roundMoney(row.estimatedAmount - row.orderedAmount),
      })),
    planStatusTracking: {
      totalWithPlanReference: requisitions.filter(
        (row) => Boolean(row.planningNote?.trim()),
      ).length,
      routedToProcurement: requisitions.filter(
        (row) => row.routedToProcurementAt !== null,
      ).length,
      converted: requisitions.filter((row) => row.convertedAt !== null).length,
      rows: requisitions
        .filter((row) => Boolean(row.planningNote?.trim()))
        .slice(0, 15)
        .map((row) => ({
          requisitionNumber: row.requisitionNumber,
          projectPlan: row.planningNote?.trim() ?? "N/A",
          status: row.status,
          assignedProcurementOfficer:
            row.assignedProcurementOfficer?.name ??
            row.assignedProcurementOfficer?.email ??
            null,
          requestedAt: row.requestedAt.toISOString(),
        })),
    },
    mrfStatusTracking: {
      counts: requisitionStatusCounts,
      rows: requisitions.slice(0, 15).map((row) => ({
        requisitionNumber: row.requisitionNumber,
        warehouseName: row.warehouse.name,
        status: row.status,
        budgetCode: row.budgetCode,
        requestedAt: row.requestedAt.toISOString(),
        estimatedAmount: asNumber(row.estimatedAmount),
        procurementOfficer:
          row.assignedProcurementOfficer?.name ??
          row.assignedProcurementOfficer?.email ??
          null,
      })),
    },
  };
}

export async function exportScmReportCsv(
  section: ScmExportSection,
  input: DateRangeInput = {},
) {
  const report = await getScmDashboardOverview(input);

  switch (section) {
    case "pipeline":
      return {
        filename: `scm-procurement-pipeline-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          ["Module", "Status", "Count"],
          [
            ...report.procurementPipeline.requisitions.map((row) => [
              "Purchase Requisitions",
              row.status,
              row.count,
            ]),
            ...report.procurementPipeline.rfqs.map((row) => [
              "RFQs",
              row.status,
              row.count,
            ]),
            ...report.procurementPipeline.comparativeStatements.map((row) => [
              "Comparative Statements",
              row.status,
              row.count,
            ]),
            ...report.procurementPipeline.purchaseOrders.map((row) => [
              "Purchase Orders",
              row.status,
              row.count,
            ]),
            ...report.procurementPipeline.goodsReceipts.map((row) => [
              "Goods Receipts",
              row.status,
              row.count,
            ]),
            ...report.procurementPipeline.supplierInvoices.map((row) => [
              "Supplier Invoices",
              row.status,
              row.count,
            ]),
            ...report.procurementPipeline.paymentRequests.map((row) => [
              "Payment Requests",
              row.status,
              row.count,
            ]),
          ],
        ),
      };
    case "vendors":
      return {
        filename: `scm-vendor-performance-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "Supplier",
            "Code",
            "Evaluations",
            "Average Rating",
            "Returns",
            "Awards",
            "Payments",
          ],
          report.vendorPerformance.topSuppliers.map((row) => [
            row.supplierName,
            row.supplierCode,
            row.evaluations,
            row.averageRating,
            row.returns,
            row.awards,
            row.payments,
          ]),
        ),
      };
    case "rfqs":
      return {
        filename: `scm-rfq-status-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "RFQ Number",
            "Status",
            "Requested At",
            "Submission Deadline",
            "Warehouse",
            "Invites",
            "Quotations",
            "Awarded Supplier",
          ],
          report.rfqStatus.rows.map((row) => [
            row.rfqNumber,
            row.status,
            row.requestedAt,
            row.submissionDeadline ?? "",
            `${row.warehouseName} (${row.warehouseCode})`,
            row.inviteCount,
            row.quotationCount,
            row.awardedSupplier ?? "",
          ]),
        ),
      };
    case "comparative":
      return {
        filename: `scm-comparative-statements-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "CS Number",
            "Status",
            "Approval Stage",
            "Generated At",
            "Warehouse",
            "RFQ Number",
          ],
          report.comparativeStatementSummary.rows.map((row) => [
            row.csNumber,
            row.status,
            row.approvalStage,
            row.generatedAt,
            `${row.warehouseName} (${row.warehouseCode})`,
            row.rfqNumber,
          ]),
        ),
      };
    case "purchase-orders":
      return {
        filename: `scm-purchase-orders-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "PO Number",
            "Status",
            "Approval Stage",
            "Order Date",
            "Expected At",
            "Warehouse",
            "Supplier",
            "Grand Total",
          ],
          report.purchaseOrderTracking.rows.map((row) => [
            row.poNumber,
            row.status,
            row.approvalStage,
            row.orderDate,
            row.expectedAt ?? "",
            `${row.warehouseName} (${row.warehouseCode})`,
            row.supplierName,
            row.grandTotal,
          ]),
        ),
      };
    case "grn-stock":
      return {
        filename: `scm-grn-stock-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "Receipt Number",
            "Status",
            "Received At",
            "Requester Confirmed At",
            "Warehouse",
            "Supplier",
            "Quantity Received",
          ],
          report.grnStockSummary.rows.map((row) => [
            row.receiptNumber,
            row.status,
            row.receivedAt,
            row.requesterConfirmedAt ?? "",
            row.warehouseName,
            row.supplierName,
            row.quantityReceived,
          ]),
        ),
      };
    case "payments":
      return {
        filename: `scm-payments-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "PRF Number",
            "Status",
            "Approval Stage",
            "Requested At",
            "Paid At",
            "Supplier",
            "Amount",
            "Invoice Number",
          ],
          report.paymentSummary.rows.map((row) => [
            row.prfNumber,
            row.status,
            row.approvalStage,
            row.requestedAt,
            row.paidAt ?? "",
            row.supplierName,
            row.amount,
            row.invoiceNumber ?? "",
          ]),
        ),
      };
    case "audit":
      return {
        filename: `scm-audit-log-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          ["Action", "Entity", "Entity ID", "Created At", "Actor"],
          report.auditSummary.recentEvents.map((row) => [
            row.action,
            row.entity,
            row.entityId,
            row.createdAt,
            row.actorName,
          ]),
        ),
      };
    case "projects":
      return {
        filename: `scm-project-summary-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "Project / Plan",
            "Requisitions",
            "Approved Requisitions",
            "Converted Requisitions",
            "RFQs",
            "Purchase Orders",
            "Ordered Amount",
            "Invoiced Amount",
            "Paid Amount",
          ],
          report.projectProcurementSummary.map((row) => [
            row.projectPlan,
            row.requisitions,
            row.approvedRequisitions,
            row.convertedRequisitions,
            row.rfqs,
            row.purchaseOrders,
            row.orderedAmount,
            row.invoicedAmount,
            row.paidAmount,
          ]),
        ),
      };
    case "budgets":
      return {
        filename: `scm-budget-vs-procurement-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "Budget Code",
            "Requisitions",
            "Approved Requisitions",
            "Estimated Amount",
            "Purchase Orders",
            "Ordered Amount",
            "Invoiced Amount",
            "Paid Amount",
            "Remaining Budget Gap",
          ],
          report.budgetVsProcurement.map((row) => [
            row.budgetCode,
            row.requisitions,
            row.approvedRequisitions,
            row.estimatedAmount,
            row.purchaseOrders,
            row.orderedAmount,
            row.invoicedAmount,
            row.paidAmount,
            row.remainingBudgetGap,
          ]),
        ),
      };
    case "plans":
      return {
        filename: `scm-plan-status-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "Requisition Number",
            "Project / Plan",
            "Status",
            "Assigned Procurement Officer",
            "Requested At",
          ],
          report.planStatusTracking.rows.map((row) => [
            row.requisitionNumber,
            row.projectPlan,
            row.status,
            row.assignedProcurementOfficer ?? "",
            row.requestedAt,
          ]),
        ),
      };
    case "mrf":
      return {
        filename: `scm-mrf-status-${report.filters.from}-to-${report.filters.to}.csv`,
        content: makeCsv(
          [
            "Requisition Number",
            "Warehouse",
            "Status",
            "Budget Code",
            "Requested At",
            "Estimated Amount",
            "Procurement Officer",
          ],
          report.mrfStatusTracking.rows.map((row) => [
            row.requisitionNumber,
            row.warehouseName,
            row.status,
            row.budgetCode ?? "",
            row.requestedAt,
            row.estimatedAmount,
            row.procurementOfficer ?? "",
          ]),
        ),
      };
    default: {
      const exhaustiveCheck: never = section;
      throw new Error(`Unsupported SCM export section: ${String(exhaustiveCheck)}`);
    }
  }
}
