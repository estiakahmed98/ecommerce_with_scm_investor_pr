import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/lib/rbac";

export type ScmWorkspaceTask = {
  key: string;
  module: string;
  title: string;
  description: string;
  href: string;
  status: string;
  actionLabel: string;
  priority: "critical" | "high" | "normal";
  ageDays: number;
  dueAt: string | null;
  createdAt: string;
  warehouseName: string | null;
};

export type ScmWorkspaceException = {
  key: string;
  module: string;
  title: string;
  description: string;
  href: string;
  severity: "critical" | "high" | "medium";
  status: string;
  ageDays: number;
  dueAt: string | null;
  createdAt: string;
  warehouseName: string | null;
};

export type ScmMyTasksPayload = {
  summary: {
    needsMyAction: number;
    waitingOnOthers: number;
    recentlyCompleted: number;
    overdue: number;
  };
  needsMyAction: ScmWorkspaceTask[];
  waitingOnOthers: ScmWorkspaceTask[];
  recentlyCompleted: ScmWorkspaceTask[];
};

export type ScmExceptionsPayload = {
  summary: {
    critical: number;
    needsReview: number;
    operationalRisks: number;
  };
  critical: ScmWorkspaceException[];
  needsReview: ScmWorkspaceException[];
  operationalRisks: ScmWorkspaceException[];
};

const TASK_LIMIT = 10;
const EXCEPTION_LIMIT = 8;

function hasGlobalScmScope(access: AccessContext) {
  return access.isSuperAdmin || access.hasGlobal("scm.access") || access.hasGlobal("admin.panel.access");
}

function canSeeWarehouse(access: AccessContext, warehouseId: number | null | undefined) {
  if (hasGlobalScmScope(access)) return true;
  if (warehouseId == null) return false;
  return access.canAccessWarehouse(warehouseId);
}

function toIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function diffDays(from: Date, to = new Date()) {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function sortNewest<T extends { createdAt: string; key: string }>(items: T[]) {
  return items.sort((left, right) => {
    const timeDiff =
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    return timeDiff !== 0 ? timeDiff : right.key.localeCompare(left.key);
  });
}

export async function getScmMyTasks(access: AccessContext): Promise<ScmMyTasksPayload> {
  if (!access.userId) {
    return {
      summary: { needsMyAction: 0, waitingOnOthers: 0, recentlyCompleted: 0, overdue: 0 },
      needsMyAction: [],
      waitingOnOthers: [],
      recentlyCompleted: [],
    };
  }

  const today = startOfToday();
  const recentCutoff = new Date(today);
  recentCutoff.setDate(recentCutoff.getDate() - 14);

  const needsMyAction: ScmWorkspaceTask[] = [];
  const waitingOnOthers: ScmWorkspaceTask[] = [];
  const recentlyCompleted: ScmWorkspaceTask[] = [];

  const purchaseRequisitionWhere =
    hasGlobalScmScope(access) || access.warehouseIds.length === 0
      ? {}
      : { warehouseId: { in: access.warehouseIds } };

  const materialRequestWhere =
    hasGlobalScmScope(access) || access.warehouseIds.length === 0
      ? {}
      : { warehouseId: { in: access.warehouseIds } };

  const transferWhere =
    hasGlobalScmScope(access) || access.warehouseIds.length === 0
      ? {}
      : {
          OR: [
            { sourceWarehouseId: { in: access.warehouseIds } },
            { destinationWarehouseId: { in: access.warehouseIds } },
          ],
        };

  const [
    requisitions,
    comparativeStatements,
    purchaseOrders,
    paymentRequests,
    materialRequests,
    goodsReceipts,
    transfers,
  ] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where: purchaseRequisitionWhere,
      select: {
        id: true,
        requisitionNumber: true,
        status: true,
        requestedAt: true,
        neededBy: true,
        title: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        createdById: true,
        assignedProcurementOfficerId: true,
        approvedAt: true,
        rejectedAt: true,
        convertedAt: true,
      },
      orderBy: { requestedAt: "desc" },
      take: 60,
    }),
    prisma.comparativeStatement.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? {}
          : { warehouseId: { in: access.warehouseIds } },
      select: {
        id: true,
        csNumber: true,
        status: true,
        generatedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        createdById: true,
      },
      orderBy: { generatedAt: "desc" },
      take: 50,
    }),
    prisma.purchaseOrder.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? {}
          : { warehouseId: { in: access.warehouseIds } },
      select: {
        id: true,
        poNumber: true,
        status: true,
        orderDate: true,
        expectedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        createdById: true,
        approvedAt: true,
        rejectedAt: true,
      },
      orderBy: { orderDate: "desc" },
      take: 50,
    }),
    prisma.paymentRequest.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? {}
          : {
              OR: [
                { warehouseId: { in: access.warehouseIds } },
                { warehouseId: null },
              ],
            },
      select: {
        id: true,
        prfNumber: true,
        status: true,
        requestedAt: true,
        createdById: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        paidAt: true,
      },
      orderBy: { requestedAt: "desc" },
      take: 60,
    }),
    prisma.materialRequest.findMany({
      where: materialRequestWhere,
      select: {
        id: true,
        requestNumber: true,
        status: true,
        requestedAt: true,
        requiredBy: true,
        title: true,
        createdById: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        adminApprovedAt: true,
      },
      orderBy: { requestedAt: "desc" },
      take: 50,
    }),
    prisma.goodsReceipt.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? { requesterConfirmedAt: null }
          : { requesterConfirmedAt: null, warehouseId: { in: access.warehouseIds } },
      select: {
        id: true,
        receiptNumber: true,
        receivedAt: true,
        requesterConfirmedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        purchaseOrder: {
          select: {
            purchaseRequisition: {
              select: {
                createdById: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 30,
    }),
    prisma.warehouseTransfer.findMany({
      where: transferWhere,
      select: {
        id: true,
        transferNumber: true,
        status: true,
        requestedAt: true,
        requiredBy: true,
        createdById: true,
        sourceWarehouseId: true,
        destinationWarehouseId: true,
        sourceWarehouse: { select: { name: true } },
        destinationWarehouse: { select: { name: true } },
        receivedAt: true,
      },
      orderBy: { requestedAt: "desc" },
      take: 40,
    }),
  ]);

  for (const row of requisitions) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;

    const ageDays = diffDays(row.requestedAt);
    const base = {
      module: "Purchase Requisition",
      warehouseName: row.warehouse.name,
      createdAt: row.requestedAt.toISOString(),
      dueAt: toIso(row.neededBy),
    };

    if (access.has("mrf.budget_clear") && row.status === "SUBMITTED") {
      needsMyAction.push({
        key: `pr-budget-${row.id}`,
        title: row.requisitionNumber,
        description: row.title || "Budget clearance required before endorsement.",
        href: `/admin/scm/purchase-requisitions/${row.id}`,
        status: row.status,
        actionLabel: "Clear Budget",
        priority: ageDays >= 3 ? "critical" : "high",
        ageDays,
        ...base,
      });
    }
    if (access.has("mrf.endorse") && row.status === "BUDGET_CLEARED") {
      needsMyAction.push({
        key: `pr-endorse-${row.id}`,
        title: row.requisitionNumber,
        description: row.title || "Endorsement is pending for procurement routing.",
        href: `/admin/scm/purchase-requisitions/${row.id}`,
        status: row.status,
        actionLabel: "Endorse",
        priority: ageDays >= 3 ? "critical" : "high",
        ageDays,
        ...base,
      });
    }
    if (access.has("mrf.final_approve") && row.status === "ENDORSED") {
      needsMyAction.push({
        key: `pr-approve-${row.id}`,
        title: row.requisitionNumber,
        description: row.title || "Final approval required to release sourcing.",
        href: `/admin/scm/purchase-requisitions/${row.id}`,
        status: row.status,
        actionLabel: "Final Approve",
        priority: ageDays >= 3 ? "critical" : "high",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("rfq.manage") &&
      row.assignedProcurementOfficerId === access.userId &&
      row.status === "APPROVED"
    ) {
      needsMyAction.push({
        key: `pr-rfq-${row.id}`,
        title: row.requisitionNumber,
        description: row.title || "Approved requisition is waiting for RFQ creation.",
        href: `/admin/scm/rfqs/new?requisitionId=${row.id}`,
        status: row.status,
        actionLabel: "Prepare RFQ",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["SUBMITTED", "BUDGET_CLEARED", "ENDORSED", "APPROVED"].includes(row.status)
    ) {
      waitingOnOthers.push({
        key: `pr-wait-${row.id}`,
        title: row.requisitionNumber,
        description: row.title || "Your requisition is moving through approvals.",
        href: `/admin/scm/purchase-requisitions/${row.id}`,
        status: row.status,
        actionLabel: "Track Status",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["APPROVED", "CONVERTED", "REJECTED", "CANCELLED"].includes(row.status) &&
      row.requestedAt >= recentCutoff
    ) {
      recentlyCompleted.push({
        key: `pr-done-${row.id}`,
        title: row.requisitionNumber,
        description: row.title || "Recent requisition decision available.",
        href: `/admin/scm/purchase-requisitions/${row.id}`,
        status: row.status,
        actionLabel: "Review",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
  }

  for (const row of comparativeStatements) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.generatedAt);
    const base = {
      module: "Comparative Statement",
      warehouseName: row.warehouse.name,
      createdAt: row.generatedAt.toISOString(),
      dueAt: null,
    };

    if (access.has("comparative_statements.approve_manager") && row.status === "SUBMITTED") {
      needsMyAction.push({
        key: `cs-manager-${row.id}`,
        title: row.csNumber,
        description: "Manager review pending before committee routing.",
        href: "/admin/scm/comparative-statements",
        status: row.status,
        actionLabel: "Review CS",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("comparative_statements.approve_committee") &&
      row.status === "MANAGER_APPROVED"
    ) {
      needsMyAction.push({
        key: `cs-committee-${row.id}`,
        title: row.csNumber,
        description: "Committee approval is pending.",
        href: "/admin/scm/comparative-statements",
        status: row.status,
        actionLabel: "Committee Review",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("comparative_statements.approve_final") &&
      row.status === "COMMITTEE_APPROVED"
    ) {
      needsMyAction.push({
        key: `cs-final-${row.id}`,
        title: row.csNumber,
        description: "Final approval is pending before PO generation.",
        href: "/admin/scm/comparative-statements",
        status: row.status,
        actionLabel: "Final Approval",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"].includes(row.status)
    ) {
      waitingOnOthers.push({
        key: `cs-wait-${row.id}`,
        title: row.csNumber,
        description: "Awaiting downstream approval to continue sourcing.",
        href: "/admin/scm/comparative-statements",
        status: row.status,
        actionLabel: "Track Status",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["FINAL_APPROVED", "REJECTED", "CANCELLED"].includes(row.status) &&
      row.generatedAt >= recentCutoff
    ) {
      recentlyCompleted.push({
        key: `cs-done-${row.id}`,
        title: row.csNumber,
        description: "CS workflow finished recently.",
        href: "/admin/scm/comparative-statements",
        status: row.status,
        actionLabel: "Open CS",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
  }

  for (const row of purchaseOrders) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.orderDate);
    const base = {
      module: "Purchase Order",
      warehouseName: row.warehouse.name,
      createdAt: row.orderDate.toISOString(),
      dueAt: toIso(row.expectedAt),
    };

    if (access.has("purchase_orders.approve_manager") && row.status === "SUBMITTED") {
      needsMyAction.push({
        key: `po-manager-${row.id}`,
        title: row.poNumber,
        description: "Manager review required before committee approval.",
        href: `/admin/scm/purchase-orders/${row.id}`,
        status: row.status,
        actionLabel: "Review PO",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("purchase_orders.approve_committee") &&
      row.status === "MANAGER_APPROVED"
    ) {
      needsMyAction.push({
        key: `po-committee-${row.id}`,
        title: row.poNumber,
        description: "Committee approval is pending.",
        href: `/admin/scm/purchase-orders/${row.id}`,
        status: row.status,
        actionLabel: "Committee Review",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      (access.has("purchase_orders.approve_final") || access.has("purchase_orders.approve")) &&
      row.status === "COMMITTEE_APPROVED"
    ) {
      needsMyAction.push({
        key: `po-final-${row.id}`,
        title: row.poNumber,
        description: "Final issue approval pending before receipt.",
        href: `/admin/scm/purchase-orders/${row.id}`,
        status: row.status,
        actionLabel: "Approve PO",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (row.createdById === access.userId && ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"].includes(row.status)) {
      waitingOnOthers.push({
        key: `po-wait-${row.id}`,
        title: row.poNumber,
        description: "Your PO is waiting for downstream approval.",
        href: `/admin/scm/purchase-orders/${row.id}`,
        status: row.status,
        actionLabel: "Track PO",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["APPROVED", "RECEIVED", "REJECTED", "CANCELLED"].includes(row.status) &&
      row.orderDate >= recentCutoff
    ) {
      recentlyCompleted.push({
        key: `po-done-${row.id}`,
        title: row.poNumber,
        description: "Recent PO outcome available.",
        href: `/admin/scm/purchase-orders/${row.id}`,
        status: row.status,
        actionLabel: "Review PO",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
  }

  for (const row of paymentRequests) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.requestedAt);
    const base = {
      module: "Payment Request",
      warehouseName: row.warehouse?.name ?? null,
      createdAt: row.requestedAt.toISOString(),
      dueAt: null,
    };

    if (access.has("payment_requests.approve_admin") && row.status === "SUBMITTED") {
      needsMyAction.push({
        key: `prf-admin-${row.id}`,
        title: row.prfNumber,
        description: "Manager approval required before finance review.",
        href: `/admin/scm/payment-requests/${row.id}`,
        status: row.status,
        actionLabel: "Approve PRF",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("payment_requests.approve_finance") &&
      row.status === "MANAGER_APPROVED"
    ) {
      needsMyAction.push({
        key: `prf-finance-${row.id}`,
        title: row.prfNumber,
        description: "Finance review pending before treasury processing.",
        href: `/admin/scm/payment-requests/${row.id}`,
        status: row.status,
        actionLabel: "Finance Review",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("payment_requests.treasury") &&
      ["FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(row.status)
    ) {
      needsMyAction.push({
        key: `prf-treasury-${row.id}`,
        title: row.prfNumber,
        description: "Treasury action pending for supplier settlement.",
        href: `/admin/scm/payment-requests/${row.id}`,
        status: row.status,
        actionLabel: row.status === "FINANCE_APPROVED" ? "Start Treasury" : "Complete Payment",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(row.status)
    ) {
      waitingOnOthers.push({
        key: `prf-wait-${row.id}`,
        title: row.prfNumber,
        description: "Your payment request is moving through approvals.",
        href: `/admin/scm/payment-requests/${row.id}`,
        status: row.status,
        actionLabel: "Track PRF",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["PAID", "REJECTED", "CANCELLED"].includes(row.status) &&
      row.requestedAt >= recentCutoff
    ) {
      recentlyCompleted.push({
        key: `prf-done-${row.id}`,
        title: row.prfNumber,
        description: "Recent payment request decision available.",
        href: `/admin/scm/payment-requests/${row.id}`,
        status: row.status,
        actionLabel: "Review PRF",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
  }

  for (const row of materialRequests) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.requestedAt);
    const base = {
      module: "Material Request",
      warehouseName: row.warehouse.name,
      createdAt: row.requestedAt.toISOString(),
      dueAt: toIso(row.requiredBy),
    };

    if (
      access.has("material_requests.endorse_supervisor") &&
      row.status === "SUBMITTED"
    ) {
      needsMyAction.push({
        key: `mr-supervisor-${row.id}`,
        title: row.requestNumber,
        description: row.title || "Supervisor endorsement pending.",
        href: `/admin/scm/material-requests/${row.id}`,
        status: row.status,
        actionLabel: "Endorse Request",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("material_requests.endorse_project_manager") &&
      row.status === "SUPERVISOR_ENDORSED"
    ) {
      needsMyAction.push({
        key: `mr-project-${row.id}`,
        title: row.requestNumber,
        description: row.title || "Project manager endorsement pending.",
        href: `/admin/scm/material-requests/${row.id}`,
        status: row.status,
        actionLabel: "Project Review",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      access.has("material_requests.approve_admin") &&
      row.status === "PROJECT_MANAGER_ENDORSED"
    ) {
      needsMyAction.push({
        key: `mr-admin-${row.id}`,
        title: row.requestNumber,
        description: row.title || "Admin approval pending before release.",
        href: `/admin/scm/material-requests/${row.id}`,
        status: row.status,
        actionLabel: "Approve Request",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["SUBMITTED", "SUPERVISOR_ENDORSED", "PROJECT_MANAGER_ENDORSED", "ADMIN_APPROVED"].includes(row.status)
    ) {
      waitingOnOthers.push({
        key: `mr-wait-${row.id}`,
        title: row.requestNumber,
        description: row.title || "Your material request is waiting on another stage.",
        href: `/admin/scm/material-requests/${row.id}`,
        status: row.status,
        actionLabel: "Track Request",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
    if (
      row.createdById === access.userId &&
      ["RELEASED", "REJECTED", "CANCELLED"].includes(row.status) &&
      row.requestedAt >= recentCutoff
    ) {
      recentlyCompleted.push({
        key: `mr-done-${row.id}`,
        title: row.requestNumber,
        description: row.title || "Recent material request outcome available.",
        href: `/admin/scm/material-requests/${row.id}`,
        status: row.status,
        actionLabel: "Review",
        priority: "normal",
        ageDays,
        ...base,
      });
    }
  }

  for (const row of goodsReceipts) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    if (row.purchaseOrder.purchaseRequisition?.createdById !== access.userId) continue;

    const ageDays = diffDays(row.receivedAt);
    needsMyAction.push({
      key: `gr-confirm-${row.id}`,
      module: "Goods Receipt",
      title: row.receiptNumber,
      description:
        row.purchaseOrder.purchaseRequisition?.title ||
        "Warehouse has received goods and is waiting for your confirmation.",
      href: `/admin/scm/goods-receipts/${row.id}`,
      status: "PENDING_CONFIRMATION",
      actionLabel: "Confirm GRN",
      priority: ageDays >= 2 ? "high" : "normal",
      ageDays,
      dueAt: null,
      createdAt: row.receivedAt.toISOString(),
      warehouseName: row.warehouse.name,
    });
  }

  for (const row of transfers) {
    const warehouseName = `${row.sourceWarehouse.name} -> ${row.destinationWarehouse.name}`;
    const ageDays = diffDays(row.requestedAt);
    const sourceVisible = canSeeWarehouse(access, row.sourceWarehouseId);
    const destinationVisible = canSeeWarehouse(access, row.destinationWarehouseId);
    if (!sourceVisible && !destinationVisible) continue;

    if (access.has("warehouse_transfers.approve") && row.status === "SUBMITTED") {
      needsMyAction.push({
        key: `wt-approve-${row.id}`,
        module: "Warehouse Transfer",
        title: row.transferNumber,
        description: "Approval required before warehouse dispatch.",
        href: `/admin/scm/warehouse-transfers/${row.id}`,
        status: row.status,
        actionLabel: "Approve Transfer",
        priority: ageDays >= 2 ? "high" : "normal",
        ageDays,
        dueAt: toIso(row.requiredBy),
        createdAt: row.requestedAt.toISOString(),
        warehouseName,
      });
    }
    if (
      access.has("warehouse_transfers.manage") &&
      ["APPROVED", "PARTIALLY_DISPATCHED", "DISPATCHED", "PARTIALLY_RECEIVED"].includes(
        row.status,
      )
    ) {
      needsMyAction.push({
        key: `wt-progress-${row.id}`,
        module: "Warehouse Transfer",
        title: row.transferNumber,
        description: "Transfer needs dispatch or receipt completion.",
        href: `/admin/scm/warehouse-transfers/${row.id}`,
        status: row.status,
        actionLabel: "Update Transfer",
        priority: row.status === "DISPATCHED" ? "high" : "normal",
        ageDays,
        dueAt: toIso(row.requiredBy),
        createdAt: row.requestedAt.toISOString(),
        warehouseName,
      });
    }
    if (
      row.createdById === access.userId &&
      ["SUBMITTED", "APPROVED", "PARTIALLY_DISPATCHED", "DISPATCHED", "PARTIALLY_RECEIVED"].includes(row.status)
    ) {
      waitingOnOthers.push({
        key: `wt-wait-${row.id}`,
        module: "Warehouse Transfer",
        title: row.transferNumber,
        description: "Transfer is active and waiting for the next warehouse action.",
        href: `/admin/scm/warehouse-transfers/${row.id}`,
        status: row.status,
        actionLabel: "Track Transfer",
        priority: "normal",
        ageDays,
        dueAt: toIso(row.requiredBy),
        createdAt: row.requestedAt.toISOString(),
        warehouseName,
      });
    }
    if (
      row.createdById === access.userId &&
      ["RECEIVED", "CANCELLED"].includes(row.status) &&
      row.requestedAt >= recentCutoff
    ) {
      recentlyCompleted.push({
        key: `wt-done-${row.id}`,
        module: "Warehouse Transfer",
        title: row.transferNumber,
        description: "Recent warehouse transfer outcome available.",
        href: `/admin/scm/warehouse-transfers/${row.id}`,
        status: row.status,
        actionLabel: "Review",
        priority: "normal",
        ageDays,
        dueAt: toIso(row.requiredBy),
        createdAt: row.requestedAt.toISOString(),
        warehouseName,
      });
    }
  }

  const sortedNeeds = sortNewest(needsMyAction).slice(0, TASK_LIMIT);
  const sortedWaiting = sortNewest(waitingOnOthers).slice(0, TASK_LIMIT);
  const sortedDone = sortNewest(recentlyCompleted).slice(0, TASK_LIMIT);

  return {
    summary: {
      needsMyAction: sortedNeeds.length,
      waitingOnOthers: sortedWaiting.length,
      recentlyCompleted: sortedDone.length,
      overdue: sortedNeeds.filter((item) => item.ageDays >= 3).length,
    },
    needsMyAction: sortedNeeds,
    waitingOnOthers: sortedWaiting,
    recentlyCompleted: sortedDone,
  };
}

export async function getScmExceptions(access: AccessContext): Promise<ScmExceptionsPayload> {
  const critical: ScmWorkspaceException[] = [];
  const needsReview: ScmWorkspaceException[] = [];
  const operationalRisks: ScmWorkspaceException[] = [];
  const today = startOfToday();

  const [
    latestSnapshot,
    overdueRequisitions,
    overdueComparativeStatements,
    overduePurchaseOrders,
    pendingRequesterConfirmations,
    invoiceVariances,
    paymentBacklog,
    openReturns,
    transferDelays,
    slaBreaches,
  ] = await Promise.all([
    prisma.inventoryDailySnapshot.findFirst({
      where: { warehouseId: { not: null } },
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true },
    }),
    prisma.purchaseRequisition.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? { status: { in: ["SUBMITTED", "BUDGET_CLEARED", "ENDORSED"] } }
          : {
              warehouseId: { in: access.warehouseIds },
              status: { in: ["SUBMITTED", "BUDGET_CLEARED", "ENDORSED"] },
            },
      select: {
        id: true,
        requisitionNumber: true,
        status: true,
        requestedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
        title: true,
      },
      orderBy: { requestedAt: "asc" },
      take: 20,
    }),
    prisma.comparativeStatement.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? { status: { in: ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"] } }
          : {
              warehouseId: { in: access.warehouseIds },
              status: { in: ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"] },
            },
      select: {
        id: true,
        csNumber: true,
        status: true,
        generatedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
      },
      orderBy: { generatedAt: "asc" },
      take: 20,
    }),
    prisma.purchaseOrder.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? {
              OR: [
                { status: { in: ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"] } },
                { status: "APPROVED", expectedAt: { lt: new Date() } },
              ],
            }
          : {
              warehouseId: { in: access.warehouseIds },
              OR: [
                { status: { in: ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"] } },
                { status: "APPROVED", expectedAt: { lt: new Date() } },
              ],
            },
      select: {
        id: true,
        poNumber: true,
        status: true,
        orderDate: true,
        expectedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
      },
      orderBy: [{ expectedAt: "asc" }, { orderDate: "asc" }],
      take: 20,
    }),
    prisma.goodsReceipt.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? { requesterConfirmedAt: null }
          : { requesterConfirmedAt: null, warehouseId: { in: access.warehouseIds } },
      select: {
        id: true,
        receiptNumber: true,
        receivedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
      },
      orderBy: { receivedAt: "asc" },
      take: 20,
    }),
    access.hasAny(["three_way_match.read", "supplier_invoices.read", "supplier_invoices.manage"])
      ? prisma.supplierInvoice.findMany({
          where: { matchStatus: "VARIANCE" },
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            dueDate: true,
            purchaseOrder: {
              select: {
                warehouseId: true,
                warehouse: { select: { name: true } },
              },
            },
          },
          orderBy: { issueDate: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
    prisma.paymentRequest.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? {
              status: {
                in: ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "TREASURY_PROCESSING"],
              },
            }
          : {
              OR: [
                {
                  warehouseId: { in: access.warehouseIds },
                  status: {
                    in: ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "TREASURY_PROCESSING"],
                  },
                },
                {
                  warehouseId: null,
                  status: {
                    in: ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "TREASURY_PROCESSING"],
                  },
                },
              ],
            },
      select: {
        id: true,
        prfNumber: true,
        status: true,
        requestedAt: true,
        warehouseId: true,
        warehouse: { select: { name: true } },
      },
      orderBy: { requestedAt: "asc" },
      take: 20,
    }),
    access.hasAny(["supplier_returns.read", "supplier_returns.manage", "supplier_returns.approve"])
      ? prisma.supplierReturn.findMany({
          where:
            hasGlobalScmScope(access) || access.warehouseIds.length === 0
              ? { status: { in: ["APPROVED", "PARTIALLY_DISPATCHED", "DISPATCHED"] } }
              : {
                  warehouseId: { in: access.warehouseIds },
                  status: { in: ["APPROVED", "PARTIALLY_DISPATCHED", "DISPATCHED"] },
                },
          select: {
            id: true,
            returnNumber: true,
            status: true,
            requestedAt: true,
            requiredBy: true,
            warehouseId: true,
            warehouse: { select: { name: true } },
          },
          orderBy: { requestedAt: "asc" },
          take: 20,
        })
      : Promise.resolve([]),
    prisma.warehouseTransfer.findMany({
      where:
        hasGlobalScmScope(access) || access.warehouseIds.length === 0
          ? {
              status: { in: ["APPROVED", "PARTIALLY_DISPATCHED", "DISPATCHED", "PARTIALLY_RECEIVED"] },
            }
          : {
              OR: [
                {
                  sourceWarehouseId: { in: access.warehouseIds },
                  status: { in: ["APPROVED", "PARTIALLY_DISPATCHED", "DISPATCHED", "PARTIALLY_RECEIVED"] },
                },
                {
                  destinationWarehouseId: { in: access.warehouseIds },
                  status: { in: ["APPROVED", "PARTIALLY_DISPATCHED", "DISPATCHED", "PARTIALLY_RECEIVED"] },
                },
              ],
            },
      select: {
        id: true,
        transferNumber: true,
        status: true,
        requestedAt: true,
        requiredBy: true,
        sourceWarehouse: { select: { name: true } },
        destinationWarehouse: { select: { name: true } },
      },
      orderBy: { requestedAt: "asc" },
      take: 20,
    }),
    access.hasAny(["sla.read", "sla.manage"])
      ? prisma.supplierSlaBreach.findMany({
          where: {
            OR: [{ status: { not: "OK" } }, { actionStatus: { in: ["OPEN", "IN_PROGRESS"] } }],
          },
          select: {
            id: true,
            status: true,
            severity: true,
            evaluationDate: true,
            dueDate: true,
            supplier: { select: { name: true } },
          },
          orderBy: [{ dueDate: "asc" }, { evaluationDate: "desc" }],
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const lowStockRows =
    latestSnapshot?.snapshotDate != null
      ? await prisma.inventoryDailySnapshot.findMany({
          where: {
            snapshotDate: latestSnapshot.snapshotDate,
            warehouseId:
              hasGlobalScmScope(access) || access.warehouseIds.length === 0
                ? { not: null }
                : { in: access.warehouseIds },
            status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
          },
          select: {
            id: true,
            snapshotDate: true,
            status: true,
            stock: true,
            lowStockThreshold: true,
            warehouseId: true,
            warehouse: { select: { name: true } },
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
          orderBy: [{ status: "desc" }, { stock: "asc" }],
          take: 20,
        })
      : [];

  for (const row of lowStockRows) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    critical.push({
      key: `stock-${row.id}`,
      module: "Stock Risk",
      title: `${row.product.name} (${row.variant.sku})`,
      description: `Stock is ${row.stock}. Threshold is ${row.lowStockThreshold}.`,
      href: `/admin/scm/reorder-alerts?search=${encodeURIComponent(row.variant.sku)}`,
      severity: row.status === "OUT_OF_STOCK" ? "critical" : "high",
      status: row.status,
      ageDays: diffDays(row.snapshotDate),
      dueAt: null,
      createdAt: row.snapshotDate.toISOString(),
      warehouseName: row.warehouse?.name ?? null,
    });
  }

  for (const row of overdueRequisitions) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.requestedAt);
    if (ageDays < 2) continue;
    needsReview.push({
      key: `pr-overdue-${row.id}`,
      module: "Purchase Requisition",
      title: row.requisitionNumber,
      description: row.title || "Approval has been pending longer than expected.",
      href: `/admin/scm/purchase-requisitions/${row.id}`,
      severity: ageDays >= 4 ? "critical" : "high",
      status: "OVERDUE",
      ageDays,
      dueAt: null,
      createdAt: row.requestedAt.toISOString(),
      warehouseName: row.warehouse.name,
    });
  }

  for (const row of overdueComparativeStatements) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.generatedAt);
    if (ageDays < 2) continue;
    needsReview.push({
      key: `cs-overdue-${row.id}`,
      module: "Comparative Statement",
      title: row.csNumber,
      description: "Approval queue has stalled in sourcing.",
      href: `/admin/scm/comparative-statements?status=${encodeURIComponent(row.status)}&search=${encodeURIComponent(row.csNumber)}`,
      severity: ageDays >= 4 ? "critical" : "high",
      status: "OVERDUE",
      ageDays,
      dueAt: null,
      createdAt: row.generatedAt.toISOString(),
      warehouseName: row.warehouse.name,
    });
  }

  for (const row of overduePurchaseOrders) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.expectedAt ?? row.orderDate);
    const isDeliveryLate = row.status === "APPROVED" && row.expectedAt && row.expectedAt < today;
    operationalRisks.push({
      key: `po-risk-${row.id}`,
      module: "Purchase Order",
      title: row.poNumber,
      description: isDeliveryLate
        ? "Expected delivery date has passed without full receipt."
        : "Approval queue is taking longer than expected.",
      href: `/admin/scm/purchase-orders?status=${encodeURIComponent(row.status)}&search=${encodeURIComponent(row.poNumber)}`,
      severity: isDeliveryLate ? "critical" : ageDays >= 4 ? "high" : "medium",
      status: isDeliveryLate ? "OVERDUE" : row.status,
      ageDays,
      dueAt: toIso(row.expectedAt),
      createdAt: row.orderDate.toISOString(),
      warehouseName: row.warehouse.name,
    });
  }

  for (const row of pendingRequesterConfirmations) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.receivedAt);
    needsReview.push({
      key: `gr-pending-${row.id}`,
      module: "Goods Receipt",
      title: row.receiptNumber,
      description: "Requester confirmation is still pending after receipt.",
      href: `/admin/scm/goods-receipts/${row.id}`,
      severity: ageDays >= 2 ? "high" : "medium",
      status: "PENDING_CONFIRMATION",
      ageDays,
      dueAt: null,
      createdAt: row.receivedAt.toISOString(),
      warehouseName: row.warehouse.name,
    });
  }

  for (const row of invoiceVariances) {
    const warehouseId = row.purchaseOrder?.warehouseId ?? null;
    if (!canSeeWarehouse(access, warehouseId)) continue;
    const ageDays = diffDays(row.issueDate);
    critical.push({
      key: `invoice-var-${row.id}`,
      module: "3-Way Match",
      title: row.invoiceNumber,
      description: "Invoice has quantity or cost variance against PO/GRN.",
      href: `/admin/scm/three-way-match?status=VARIANCE&search=${encodeURIComponent(row.invoiceNumber)}`,
      severity: "critical",
      status: "VARIANCE",
      ageDays,
      dueAt: toIso(row.dueDate),
      createdAt: row.issueDate.toISOString(),
      warehouseName: row.purchaseOrder?.warehouse?.name ?? null,
    });
  }

  for (const row of paymentBacklog) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.requestedAt);
    if (ageDays < 2) continue;
    critical.push({
      key: `prf-backlog-${row.id}`,
      module: "Payment Request",
      title: row.prfNumber,
      description: "Payment request is still pending in approval or treasury.",
      href: `/admin/scm/payment-requests?status=${encodeURIComponent(row.status)}&search=${encodeURIComponent(row.prfNumber)}`,
      severity: ageDays >= 4 ? "critical" : "high",
      status: row.status,
      ageDays,
      dueAt: null,
      createdAt: row.requestedAt.toISOString(),
      warehouseName: row.warehouse?.name ?? null,
    });
  }

  for (const row of openReturns) {
    if (!canSeeWarehouse(access, row.warehouseId)) continue;
    const ageDays = diffDays(row.requestedAt);
    needsReview.push({
      key: `return-open-${row.id}`,
      module: "Supplier Return",
      title: row.returnNumber,
      description: "Return has not been fully dispatched or financially closed.",
      href: `/admin/scm/supplier-returns/${row.id}`,
      severity: ageDays >= 3 ? "high" : "medium",
      status: row.status,
      ageDays,
      dueAt: toIso(row.requiredBy),
      createdAt: row.requestedAt.toISOString(),
      warehouseName: row.warehouse.name,
    });
  }

  for (const row of transferDelays) {
    const ageDays = diffDays(row.requestedAt);
    operationalRisks.push({
      key: `transfer-risk-${row.id}`,
      module: "Warehouse Transfer",
      title: row.transferNumber,
      description: "Transfer is still in progress and may delay warehouse fulfilment.",
      href: `/admin/scm/warehouse-transfers/${row.id}`,
      severity: ageDays >= 3 ? "high" : "medium",
      status: row.status,
      ageDays,
      dueAt: toIso(row.requiredBy),
      createdAt: row.requestedAt.toISOString(),
      warehouseName: `${row.sourceWarehouse.name} -> ${row.destinationWarehouse.name}`,
    });
  }

  for (const row of slaBreaches) {
    const ageDays = diffDays(row.evaluationDate);
    operationalRisks.push({
      key: `sla-${row.id}`,
      module: "SLA",
      title: row.supplier.name,
      description: "Supplier SLA breach needs owner follow-up or closure.",
      href: "/admin/scm/sla",
      severity: row.severity === "CRITICAL" ? "critical" : row.severity === "HIGH" ? "high" : "medium",
      status: row.status,
      ageDays,
      dueAt: toIso(row.dueDate),
      createdAt: row.evaluationDate.toISOString(),
      warehouseName: null,
    });
  }

  return {
    summary: {
      critical: critical.length,
      needsReview: needsReview.length,
      operationalRisks: operationalRisks.length,
    },
    critical: sortNewest(critical).slice(0, EXCEPTION_LIMIT),
    needsReview: sortNewest(needsReview).slice(0, EXCEPTION_LIMIT),
    operationalRisks: sortNewest(operationalRisks).slice(0, EXCEPTION_LIMIT),
  };
}
