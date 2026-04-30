"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, ExternalLink, Paperclip, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScmDocumentLifecycle } from "@/components/admin/scm/ScmDocumentLifecycle";
import { ScmNextStepPanel } from "@/components/admin/scm/ScmNextStepPanel";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type Supplier = {
  id: number;
  name: string;
  code: string;
};

type PurchaseRequisition = {
  id: number;
  requisitionNumber: string;
  status: string;
  title: string | null;
  purpose: string | null;
  budgetCode: string | null;
  boqReference: string | null;
  specification: string | null;
  planningNote: string | null;
  estimatedAmount: string | null;
  endorsementRequiredCount: number;
  requestedAt: string;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  convertedAt?: string | null;
  neededBy: string | null;
  budgetClearedAt: string | null;
  endorsedAt: string | null;
  routedToProcurementAt: string | null;
  assignedProcurementOfficerId: string | null;
  assignedProcurementOfficer: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  procurementOfficerCandidates?: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  approvedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  budgetClearedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  endorsedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  note: string | null;
  attachments: Array<{
    id: number;
    fileUrl: string;
    fileName: string;
    mimeType: string | null;
    fileSize: number | null;
    note: string | null;
    createdAt: string;
    uploadedBy?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  approvalEvents: Array<{
    id: number;
    stage: string;
    decision: string;
    note: string | null;
    actedAt: string;
    actedBy: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  versions: Array<{
    id: number;
    versionNo: number;
    stage: string;
    action: string;
    createdAt: string;
    createdBy: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  notifications: Array<{
    id: number;
    stage: string;
    channel: string;
    status: string;
    recipientEmail: string | null;
    message: string;
    sentAt: string | null;
    createdAt: string;
    recipientUser: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  warehouse: {
    id: number;
    name: string;
    code: string;
  };
  items: Array<{
    id: number;
    description: string | null;
    quantityRequested: number;
    quantityApproved: number | null;
    productVariant: {
      id: number;
      sku: string;
      stock: number;
      product: {
        id: number;
        name: string;
      };
    };
  }>;
  purchaseOrders: Array<{
    id: number;
    poNumber: string;
    status: string;
    supplier: Supplier;
    goodsReceipts?: Array<{
      id: number;
      receiptNumber: string;
      status: string;
    }>;
    supplierInvoices?: Array<{
      id: number;
      invoiceNumber: string;
      status: string;
      payments?: Array<{
        id: number;
        paymentNumber: string;
        amount: string | number;
      }>;
    }>;
    paymentRequests?: Array<{
      id: number;
      prfNumber: string;
      status: string;
      supplierPayment?: {
        id: number;
        paymentNumber: string;
        amount: string | number;
      } | null;
    }>;
  }>;
  rfqs?: Array<{
    id: number;
    rfqNumber: string;
    status: string;
    comparativeStatements?: Array<{
      id: number;
      csNumber: string;
      status: string;
      generatedPurchaseOrder?: {
        id: number;
        poNumber: string;
        status: string;
      } | null;
    }>;
  }>;
};

type ConversionForm = {
  supplierId: string;
  expectedAt: string;
  notes: string;
  unitCosts: Record<number, string>;
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

function toDateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toStageLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PurchaseRequisitionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requisitionId = Number(params?.id);
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canManage = permissions.includes("purchase_requisitions.manage");
  const canApprove = permissions.includes("purchase_requisitions.approve");
  const canBudgetClear = permissions.includes("mrf.budget_clear");
  const canEndorse = permissions.includes("mrf.endorse");
  const canFinalApprove = permissions.includes("mrf.final_approve");
  const canConvert = permissions.includes("purchase_orders.manage");

  const [requisition, setRequisition] = useState<PurchaseRequisition | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [workflowNote, setWorkflowNote] = useState("");
  const [selectedProcurementOfficerId, setSelectedProcurementOfficerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conversionForm, setConversionForm] = useState<ConversionForm>({
    supplierId: "",
    expectedAt: "",
    notes: "",
    unitCosts: {},
  });

  const loadRequisition = async () => {
    if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
      toast.error("Invalid requisition id");
      router.replace("/admin/scm/purchase-requisitions");
      return;
    }

    try {
      setLoading(true);
      const [requisitionRes, supplierRes] = await Promise.all([
        fetch(`/api/scm/purchase-requisitions/${requisitionId}`, { cache: "no-store" }),
        canConvert
          ? fetch("/api/scm/suppliers", { cache: "no-store" })
          : Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
      ]);

      const requisitionData = await readJson<PurchaseRequisition>(
        requisitionRes,
        "Failed to load purchase requisition",
      );
      const supplierData = supplierRes.ok
        ? await readJson<Supplier[]>(supplierRes, "Failed to load suppliers")
        : [];

      setRequisition(requisitionData);
      setSuppliers(Array.isArray(supplierData) ? supplierData : []);
      setSelectedProcurementOfficerId(requisitionData.assignedProcurementOfficerId || "");
      setConversionForm({
        supplierId: "",
        expectedAt: requisitionData.neededBy ? requisitionData.neededBy.slice(0, 10) : "",
        notes: requisitionData.note || "",
        unitCosts: Object.fromEntries(requisitionData.items.map((item) => [item.id, ""])),
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to load purchase requisition");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequisition();
  }, [requisitionId, canConvert]);

  const endorsementSummary = useMemo(() => {
    const completed =
      requisition?.approvalEvents.filter((event) => event.stage === "ENDORSEMENT").length || 0;
    return {
      completed,
      required: requisition?.endorsementRequiredCount || 0,
    };
  }, [requisition]);

  const lifecycleStages = useMemo(() => {
    if (!requisition) return [];
    const latestRfq = requisition.rfqs?.[0] ?? null;
    const latestCs = (requisition.rfqs?.flatMap((rfq) => rfq.comparativeStatements ?? []) ?? [])[0] ?? null;
    const latestPo =
      requisition.purchaseOrders[0] ?? latestCs?.generatedPurchaseOrder ?? null;
    const latestReceipt =
      requisition.purchaseOrders.flatMap((po) => po.goodsReceipts ?? [])[0] ?? null;
    const latestInvoice =
      requisition.purchaseOrders.flatMap((po) => po.supplierInvoices ?? [])[0] ?? null;
    const latestPrf =
      requisition.purchaseOrders.flatMap((po) => po.paymentRequests ?? [])[0] ?? null;
    const latestPayment =
      latestPrf?.supplierPayment ??
      requisition.purchaseOrders
        .flatMap((po) => po.supplierInvoices ?? [])
        .flatMap((invoice) => invoice.payments ?? [])[0] ??
      null;

    return [
      {
        key: "requisition",
        label: "Requisition",
        value: requisition.requisitionNumber,
        helperText: toStageLabel(requisition.status),
        href: `/admin/scm/purchase-requisitions/${requisition.id}`,
        state: "current" as const,
      },
      {
        key: "rfq",
        label: "RFQ",
        value: latestRfq?.rfqNumber || "Not created",
        helperText: latestRfq ? toStageLabel(latestRfq.status) : "Awaiting sourcing",
        href: latestRfq ? `/admin/scm/rfqs/${latestRfq.id}` : null,
        state: latestRfq ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "cs",
        label: "Comparative",
        value: latestCs?.csNumber || "Not generated",
        helperText: latestCs ? toStageLabel(latestCs.status) : "Awaiting quotations",
        href: null,
        state: latestCs ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "po",
        label: "Purchase Order",
        value: latestPo?.poNumber || "Not created",
        helperText: latestPo ? toStageLabel(latestPo.status) : "Awaiting award",
        href: latestPo ? `/admin/scm/purchase-orders/${latestPo.id}` : null,
        state: latestPo ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "grn",
        label: "Goods Receipt",
        value: latestReceipt?.receiptNumber || "Not posted",
        helperText: latestReceipt ? toStageLabel(latestReceipt.status) : "Awaiting delivery",
        href: null,
        state: latestReceipt ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "invoice",
        label: "Invoice",
        value: latestInvoice?.invoiceNumber || "Not posted",
        helperText: latestInvoice ? toStageLabel(latestInvoice.status) : "Awaiting AP posting",
        href: null,
        state: latestInvoice ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "prf",
        label: "Payment Request",
        value: latestPrf?.prfNumber || "Not created",
        helperText: latestPrf ? toStageLabel(latestPrf.status) : "Awaiting payment request",
        href: latestPrf ? `/admin/scm/payment-requests/${latestPrf.id}` : null,
        state: latestPrf ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "payment",
        label: "Payment",
        value: latestPayment?.paymentNumber || "Not settled",
        helperText: latestPayment ? "Supplier payment posted" : "Awaiting treasury settlement",
        href: null,
        state: latestPayment ? ("linked" as const) : ("pending" as const),
      },
    ];
  }, [requisition]);

  const workflowActionButtons = useMemo(() => {
    if (!requisition) return [];
    const buttons: Array<{ action: string; label: string }> = [];
    if (requisition.status === "DRAFT" && canManage) {
      buttons.push({ action: "submit", label: "Submit" });
    }
    if (requisition.status === "SUBMITTED" && canBudgetClear) {
      buttons.push({ action: "budget_clear", label: "Budget Clear" });
    }
    if (requisition.status === "BUDGET_CLEARED" && canEndorse) {
      buttons.push({ action: "endorse", label: "Endorse" });
    }
    if (requisition.status === "ENDORSED" && (canFinalApprove || canApprove)) {
      buttons.push({ action: "final_approve", label: "Final Approve" });
      buttons.push({ action: "reject", label: "Reject" });
    }
    if (
      ["SUBMITTED", "BUDGET_CLEARED"].includes(requisition.status) &&
      (canBudgetClear || canEndorse || canFinalApprove || canApprove)
    ) {
      buttons.push({ action: "reject", label: "Reject" });
    }
    if (
      ["DRAFT", "SUBMITTED", "BUDGET_CLEARED", "ENDORSED", "APPROVED"].includes(
        requisition.status,
      ) &&
      canManage
    ) {
      buttons.push({ action: "cancel", label: "Cancel" });
    }
    return buttons;
  }, [
    requisition,
    canManage,
    canBudgetClear,
    canEndorse,
    canFinalApprove,
    canApprove,
  ]);

  const runWorkflowAction = async (action: string) => {
    if (!requisition) return;
    if (action === "final_approve" && !selectedProcurementOfficerId) {
      toast.error("Select a procurement officer before final approval");
      return;
    }
    try {
      setSaving(true);
      const response = await fetch(`/api/scm/purchase-requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: workflowNote.trim() || null,
          assignedProcurementOfficerId:
            action === "final_approve" ? selectedProcurementOfficerId : undefined,
        }),
      });
      await readJson(response, `Failed to ${action} requisition`);
      toast.success(`Requisition ${toStageLabel(action)} completed`);
      setWorkflowNote("");
      await loadRequisition();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} requisition`);
    } finally {
      setSaving(false);
    }
  };

  const convertToPurchaseOrder = async () => {
    if (!requisition) return;
    if (!conversionForm.supplierId) {
      toast.error("Supplier is required for conversion");
      return;
    }
    try {
      setSaving(true);
      const response = await fetch(`/api/scm/purchase-requisitions/${requisition.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "convert",
          supplierId: Number(conversionForm.supplierId),
          expectedAt: conversionForm.expectedAt || null,
          notes: conversionForm.notes,
          unitCosts: requisition.items.map((item) => ({
            itemId: item.id,
            unitCost: Number(conversionForm.unitCosts[item.id]),
          })),
        }),
      });
      const payload = await readJson<{
        purchaseOrder?: { id: number; poNumber: string };
      }>(response, "Failed to convert purchase requisition");
      toast.success(
        payload.purchaseOrder?.poNumber
          ? `Purchase order ${payload.purchaseOrder.poNumber} created`
          : "Purchase order created",
      );
      await loadRequisition();
    } catch (error: any) {
      toast.error(error?.message || "Failed to convert requisition");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-sm text-muted-foreground">Loading requisition workspace...</p>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="space-y-6 p-6">
        <Button asChild variant="outline">
          <Link href="/admin/scm/purchase-requisitions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To Register
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Purchase requisition not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scm/purchase-requisitions">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <ScmStatusChip status={requisition.status} />
            {requisition.purchaseOrders.length > 0 ? (
              <Badge variant="secondary">Linked To PO</Badge>
            ) : null}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{requisition.requisitionNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {requisition.title || "Purchase requisition detail workspace"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadRequisition()} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {workflowActionButtons.map((button) => (
            <Button
              key={button.action}
              variant={button.action === "reject" || button.action === "cancel" ? "outline" : "default"}
              onClick={() => void runWorkflowAction(button.action)}
              disabled={saving}
            >
              {button.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard
          label="Warehouse"
          value={requisition.warehouse.name}
          hint={requisition.warehouse.code}
        />
        <ScmStatCard
          label="Needed By"
          value={requisition.neededBy ? new Date(requisition.neededBy).toLocaleDateString() : "-"}
          hint={`Requested ${new Date(requisition.requestedAt).toLocaleDateString()}`}
        />
        <ScmStatCard
          label="Estimated Amount"
          value={requisition.estimatedAmount || "0.00"}
          hint={requisition.budgetCode || "No budget code"}
        />
        <ScmStatCard
          label="Endorsements"
          value={`${endorsementSummary.completed} / ${endorsementSummary.required}`}
          hint={
            requisition.assignedProcurementOfficer?.name ||
            requisition.assignedProcurementOfficer?.email ||
            "No procurement officer assigned"
          }
        />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Submitted",
                    value: toDateLabel(requisition.submittedAt || requisition.requestedAt),
                  },
                  {
                    label: "Budget Cleared",
                    value: toDateLabel(requisition.budgetClearedAt),
                  },
                  {
                    label: "Endorsed",
                    value: toDateLabel(requisition.endorsedAt),
                  },
                  {
                    label: "Routed To Procurement",
                    value: toDateLabel(requisition.routedToProcurementAt),
                  },
                ].map((step) => (
                  <div key={step.label} className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {step.label}
                    </div>
                    <div className="mt-2 text-sm font-medium">{step.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="workflow">Workflow</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Requirement Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Purpose
                    </div>
                    <p className="mt-2 text-sm">{requisition.purpose || "-"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      BOQ Reference
                    </div>
                    <p className="mt-2 text-sm">{requisition.boqReference || "-"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Specification
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {requisition.specification || "-"}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Planning Note
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {requisition.planningNote || "-"}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Internal Note
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{requisition.note || "-"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Linked Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Purchase Orders
                    </div>
                    {requisition.purchaseOrders.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">No purchase order linked yet.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {requisition.purchaseOrders.map((purchaseOrder) => (
                          <Badge key={purchaseOrder.id} variant="outline">
                            {purchaseOrder.poNumber} • {purchaseOrder.status}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="items">
              <Card>
                <CardHeader>
                  <CardTitle>Requested Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variant</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Current Stock</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requisition.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productVariant.product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.productVariant.sku}
                            </div>
                          </TableCell>
                          <TableCell>{item.quantityRequested}</TableCell>
                          <TableCell>{item.quantityApproved ?? item.quantityRequested}</TableCell>
                          <TableCell>{item.productVariant.stock}</TableCell>
                          <TableCell>{item.description || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workflow" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Action Note</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    rows={3}
                    value={workflowNote}
                    onChange={(event) => setWorkflowNote(event.target.value)}
                    placeholder="Add optional workflow note for approval, rejection, or cancellation."
                  />
                  <p className="text-xs text-muted-foreground">
                    This note will be attached to your next workflow action from this page.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Approval Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {requisition.approvalEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No workflow actions recorded yet.</p>
                  ) : (
                    requisition.approvalEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {toStageLabel(event.stage)} • {toStageLabel(event.decision)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {toDateLabel(event.actedAt)}
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {event.actedBy?.name || event.actedBy?.email || "System"}
                        </div>
                        {event.note ? <p className="mt-2 text-sm">{event.note}</p> : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Supporting Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {requisition.attachments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No supporting documents uploaded.</p>
                  ) : (
                    requisition.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-medium">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <a
                              href={attachment.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-4 hover:underline"
                            >
                              {attachment.fileName}
                            </a>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Uploaded {toDateLabel(attachment.createdAt)} by{" "}
                            {attachment.uploadedBy?.name || attachment.uploadedBy?.email || "Unknown"}
                          </div>
                          {attachment.note ? <p className="text-sm">{attachment.note}</p> : null}
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <a href={attachment.fileUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open
                          </a>
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notification Trail</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {requisition.notifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No notification trail recorded yet.</p>
                  ) : (
                    requisition.notifications.map((notification) => (
                      <div key={notification.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {toStageLabel(notification.stage)} • {notification.channel}
                          </div>
                          <ScmStatusChip status={notification.status} />
                        </div>
                        <p className="mt-2 text-sm">{notification.message}</p>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Recipient: {notification.recipientUser?.email || notification.recipientEmail || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created {toDateLabel(notification.createdAt)}
                          {notification.sentAt ? ` • Sent ${toDateLabel(notification.sentAt)}` : ""}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle>Version History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {requisition.versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No version history available.</p>
                  ) : (
                    requisition.versions.map((version) => (
                      <div key={version.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            Version {version.versionNo} • {toStageLabel(version.action)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {toDateLabel(version.createdAt)}
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Stage: {toStageLabel(version.stage)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          By: {version.createdBy?.name || version.createdBy?.email || "System"}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Requested By
                </div>
                <div className="mt-1">{requisition.createdBy?.name || requisition.createdBy?.email || "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Budget Cleared By
                </div>
                <div className="mt-1">
                  {requisition.budgetClearedBy?.name || requisition.budgetClearedBy?.email || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Final Approved By
                </div>
                <div className="mt-1">{requisition.approvedBy?.name || requisition.approvedBy?.email || "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Procurement Officer
                </div>
                <div className="mt-1">
                  {requisition.assignedProcurementOfficer?.name ||
                    requisition.assignedProcurementOfficer?.email ||
                    "-"}
                </div>
              </div>
            </CardContent>
          </Card>

          <ScmNextStepPanel
            title={requisition.status}
            subtitle="This panel keeps conversion and workflow decisions visible without leaving the document."
            emptyMessage="No direct workflow action is available for your current permissions."
            actions={workflowActionButtons.map((button) => ({
              key: button.action,
              label: button.label,
              variant:
                button.action === "reject" || button.action === "cancel" ? "outline" : "default",
              disabled: saving,
              onClick: () => void runWorkflowAction(button.action),
            }))}
          >
            {requisition.status === "ENDORSED" && (canFinalApprove || canApprove) ? (
              <div className="space-y-2">
                <Label htmlFor="assigned-procurement-officer">Procurement Officer</Label>
                <select
                  id="assigned-procurement-officer"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedProcurementOfficerId}
                  onChange={(event) => setSelectedProcurementOfficerId(event.target.value)}
                  disabled={saving}
                >
                  <option value="">Select procurement officer</option>
                  {(requisition.procurementOfficerCandidates ?? []).map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.name || officer.email}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Final approval now routes manually to the selected procurement officer. Automatic first-match assignment has been removed.
                </p>
              </div>
            ) : null}
          </ScmNextStepPanel>

          {requisition.status === "APPROVED" && canConvert ? (
            <Card>
              <CardHeader>
                <CardTitle>Convert To Purchase Order</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Supplier</Label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2"
                    value={conversionForm.supplierId}
                    onChange={(event) =>
                      setConversionForm((current) => ({
                        ...current,
                        supplierId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Expected Delivery</Label>
                  <Input
                    type="date"
                    value={conversionForm.expectedAt}
                    onChange={(event) =>
                      setConversionForm((current) => ({
                        ...current,
                        expectedAt: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label>PO Notes</Label>
                  <Textarea
                    rows={3}
                    value={conversionForm.notes}
                    onChange={(event) =>
                      setConversionForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-medium">Unit Costs</div>
                  {requisition.items.map((item) => (
                    <div key={item.id} className="space-y-2 rounded-lg border p-3">
                      <div className="text-sm font-medium">
                        {item.productVariant.product.name} ({item.productVariant.sku})
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit cost"
                        value={conversionForm.unitCosts[item.id] || ""}
                        onChange={(event) =>
                          setConversionForm((current) => ({
                            ...current,
                            unitCosts: {
                              ...current.unitCosts,
                              [item.id]: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => void convertToPurchaseOrder()} disabled={saving}>
                  Convert To Purchase Order
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
