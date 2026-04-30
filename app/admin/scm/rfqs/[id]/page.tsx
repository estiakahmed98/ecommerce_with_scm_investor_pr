"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
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

type Warehouse = { id: number; name: string; code: string };
type Supplier = {
  id: number;
  name: string;
  code: string;
  categories?: Array<{ id: number; code: string; name: string; isActive?: boolean }>;
};
type SupplierCategory = { id: number; name: string; code: string };

type Rfq = {
  id: number;
  rfqNumber: string;
  status: string;
  requestedAt: string;
  submittedAt?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
  submissionDeadline: string | null;
  isBlindReviewActive?: boolean;
  quotationSubmissionCount?: number;
  quotationsVisibleAt?: string | null;
  note: string | null;
  scopeOfWork?: string | null;
  termsAndConditions?: string | null;
  boqDetails?: string | null;
  technicalSpecifications?: string | null;
  evaluationCriteria?: string | null;
  resubmissionAllowed?: boolean;
  resubmissionRound?: number;
  warehouse: Warehouse;
  purchaseRequisition?: {
    id: number;
    requisitionNumber: string;
    status: string;
    title?: string | null;
  } | null;
  categoryTargets?: Array<{
    id: number;
    supplierCategoryId: number;
    supplierCategory: SupplierCategory;
  }>;
  attachments?: Array<{
    id: number;
    label: string | null;
    fileUrl: string;
    fileName: string | null;
  }>;
  items: Array<{
    id: number;
    quantityRequested: number;
    description: string | null;
    targetUnitCost: string | null;
    productVariant: { sku: string; product: { name: string } };
  }>;
  supplierInvites: Array<{
    id?: number;
    supplierId: number;
    supplier: Supplier;
    status: string;
  }>;
  quotations: Array<{
    id: number;
    supplierId: number;
    supplier: Supplier;
    total: string;
    currency: string;
    revisionNo?: number;
    quotedAt?: string;
    technicalProposal?: string | null;
    financialProposal?: string | null;
    note?: string | null;
    attachments?: Array<{
      id: number;
      proposalType: "TECHNICAL" | "FINANCIAL" | "SUPPORTING";
      label: string | null;
      fileUrl: string;
      fileName: string | null;
    }>;
  }>;
  award: {
    purchaseOrderId: number | null;
    supplier: Supplier;
    supplierQuotationId: number;
  } | null;
  comparativeStatements?: Array<{
    id: number;
    csNumber: string;
    status: string;
    generatedPurchaseOrder?: {
      id: number;
      poNumber: string;
      status: string;
      goodsReceipts?: Array<{
        id: number;
        receiptNumber: string;
        status: string;
      }>;
      supplierInvoices?: Array<{
        id: number;
        invoiceNumber: string;
        status: string;
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
    } | null;
  }>;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error || fallback);
  return payload as T;
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function toStageLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function RfqDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rfqId = Number(params?.id);
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canManage = permissions.includes("rfq.manage");
  const canApprove = permissions.includes("rfq.approve");
  const canConvertPo = permissions.includes("purchase_orders.manage");

  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierCategories, setSupplierCategories] = useState<SupplierCategory[]>([]);
  const [inviteSupplier, setInviteSupplier] = useState("");
  const [inviteCategory, setInviteCategory] = useState("");
  const [quoteSupplier, setQuoteSupplier] = useState("");
  const [quoteUnitCost, setQuoteUnitCost] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [awardQuoteId, setAwardQuoteId] = useState("");
  const [resubmissionReason, setResubmissionReason] = useState("");

  const loadData = async () => {
    if (!Number.isInteger(rfqId) || rfqId <= 0) {
      toast.error("Invalid RFQ id");
      router.replace("/admin/scm/rfqs");
      return;
    }
    try {
      setLoading(true);
      const [rfqRes, supplierRes, categoryRes] = await Promise.all([
        fetch(`/api/scm/rfqs/${rfqId}`, { cache: "no-store" }),
        canManage
          ? fetch("/api/scm/suppliers", { cache: "no-store" })
          : Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
        canManage
          ? fetch("/api/scm/supplier-categories?active=true", { cache: "no-store" })
          : Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
      ]);

      const rfqData = await readJson<Rfq>(rfqRes, "Failed to load RFQ");
      const supplierData = supplierRes.ok
        ? await readJson<Supplier[]>(supplierRes, "Failed to load suppliers")
        : [];
      const categoryData = categoryRes.ok
        ? await readJson<SupplierCategory[]>(categoryRes, "Failed to load categories")
        : [];

      setRfq(rfqData);
      setSuppliers(Array.isArray(supplierData) ? supplierData : []);
      setSupplierCategories(Array.isArray(categoryData) ? categoryData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load RFQ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [rfqId, canManage]);

  const patchAction = async (action: string, extra?: Record<string, unknown>) => {
    if (!rfq) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/scm/rfqs/${rfq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(extra || {}) }),
      });
      await readJson(response, `Failed to ${action}`);
      toast.success(`RFQ ${toStageLabel(action)} completed`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action}`);
    } finally {
      setSaving(false);
    }
  };

  const suggestedSuppliers = useMemo(() => {
    if (!rfq) return [] as Supplier[];
    const targetCategoryIds = new Set(
      (rfq.categoryTargets || []).map((target) => target.supplierCategoryId),
    );
    if (targetCategoryIds.size === 0) return suppliers;
    return suppliers.filter((supplier) =>
      (supplier.categories || []).some((category) => targetCategoryIds.has(category.id)),
    );
  }, [rfq, suppliers]);

  const inviteOptions = useMemo(() => {
    if (!rfq) return [];
    const invitedIds = new Set(rfq.supplierInvites.map((item) => item.supplierId));
    return suggestedSuppliers.filter((supplier) => !invitedIds.has(supplier.id));
  }, [rfq, suggestedSuppliers]);

  const quotationSupplierOptions = useMemo(() => {
    if (!rfq) return [] as Supplier[];
    return rfq.supplierInvites.map((item) => item.supplier);
  }, [rfq]);

  const lifecycleStages = useMemo(() => {
    if (!rfq) return [];
    const latestCs = rfq.comparativeStatements?.[0] ?? null;
    const latestPo =
      latestCs?.generatedPurchaseOrder ??
      (rfq.award?.purchaseOrderId
        ? {
            id: rfq.award.purchaseOrderId,
            poNumber: `PO #${rfq.award.purchaseOrderId}`,
            status: "CREATED",
          }
        : null);
    const latestReceipt = latestCs?.generatedPurchaseOrder?.goodsReceipts?.[0] ?? null;
    const latestInvoice = latestCs?.generatedPurchaseOrder?.supplierInvoices?.[0] ?? null;
    const latestPrf = latestCs?.generatedPurchaseOrder?.paymentRequests?.[0] ?? null;
    const latestPayment = latestPrf?.supplierPayment ?? null;

    return [
      {
        key: "requisition",
        label: "Requisition",
        value: rfq.purchaseRequisition?.requisitionNumber || "Direct RFQ",
        helperText: rfq.purchaseRequisition ? toStageLabel(rfq.purchaseRequisition.status) : "No upstream requisition",
        href: rfq.purchaseRequisition ? `/admin/scm/purchase-requisitions/${rfq.purchaseRequisition.id}` : null,
        state: rfq.purchaseRequisition ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "rfq",
        label: "RFQ",
        value: rfq.rfqNumber,
        helperText: toStageLabel(rfq.status),
        href: `/admin/scm/rfqs/${rfq.id}`,
        state: "current" as const,
      },
      {
        key: "cs",
        label: "Comparative",
        value: latestCs?.csNumber || "Not generated",
        helperText: latestCs ? toStageLabel(latestCs.status) : "Awaiting evaluation",
        href: null,
        state: latestCs ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "po",
        label: "Purchase Order",
        value: latestPo?.poNumber || "Not created",
        helperText: latestPo ? toStageLabel(latestPo.status) : "Awaiting award conversion",
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
  }, [rfq]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-sm text-muted-foreground">Loading RFQ workspace...</p>
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="space-y-6 p-6">
        <Button asChild variant="outline">
          <Link href="/admin/scm/rfqs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To Register
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">RFQ not found.</CardContent>
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
              <Link href="/admin/scm/rfqs">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <ScmStatusChip status={rfq.status} />
            {rfq.isBlindReviewActive ? <Badge variant="secondary">Blind Review Active</Badge> : null}
            {rfq.award?.purchaseOrderId ? <Badge variant="secondary">PO Created</Badge> : null}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{rfq.rfqNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {rfq.purchaseRequisition?.requisitionNumber
                ? `Linked to ${rfq.purchaseRequisition.requisitionNumber}`
                : "RFQ detail workspace"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadData()} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canManage && rfq.status === "DRAFT" ? (
            <Button variant="outline" onClick={() => void patchAction("submit")} disabled={saving}>
              Submit
            </Button>
          ) : null}
          {canManage && ["SUBMITTED", "AWARDED"].includes(rfq.status) ? (
            <Button variant="outline" onClick={() => void patchAction("close")} disabled={saving}>
              Close
            </Button>
          ) : null}
          {canManage && ["DRAFT", "SUBMITTED", "CLOSED"].includes(rfq.status) ? (
            <Button variant="outline" onClick={() => void patchAction("cancel")} disabled={saving}>
              Cancel
            </Button>
          ) : null}
          {canConvertPo && rfq.status === "AWARDED" && rfq.award && !rfq.award.purchaseOrderId ? (
            <Button onClick={() => void patchAction("convert_to_po")} disabled={saving}>
              Convert To PO
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard
          label="Warehouse"
          value={rfq.warehouse.name}
          hint={rfq.warehouse.code}
        />
        <ScmStatCard
          label="Submission Deadline"
          value={rfq.submissionDeadline ? new Date(rfq.submissionDeadline).toLocaleDateString() : "-"}
          hint={`Requested ${new Date(rfq.requestedAt).toLocaleDateString()}`}
        />
        <ScmStatCard
          label="Invites / Quotes"
          value={`${rfq.supplierInvites.length} / ${rfq.quotationSubmissionCount ?? rfq.quotations.length}`}
          hint={`Round ${rfq.resubmissionRound ?? 0}`}
        />
        <ScmStatCard
          label="Award"
          value={rfq.award?.supplier.name || "Pending"}
          hint={rfq.award?.purchaseOrderId ? "PO already created" : "No PO linked"}
        />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Drafted", value: fmtDate(rfq.requestedAt) },
                  { label: "Submitted", value: fmtDate(rfq.submittedAt) },
                  { label: "Deadline Unlock", value: fmtDate(rfq.quotationsVisibleAt || rfq.submissionDeadline) },
                  { label: "Closed", value: fmtDate(rfq.closedAt) },
                ].map((step) => (
                  <div key={step.label} className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{step.label}</div>
                    <div className="mt-2 text-sm font-medium">{step.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
              <TabsTrigger value="proposals">Proposals</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="award">Award</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>RFQ Scope</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Scope Of Work</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{rfq.scopeOfWork || "-"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Terms & Conditions</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{rfq.termsAndConditions || "-"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">BoQ Details</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{rfq.boqDetails || "-"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Technical Specifications</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{rfq.technicalSpecifications || "-"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Evaluation Criteria</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{rfq.evaluationCriteria || "-"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Internal Note</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{rfq.note || "-"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>RFQ Line Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variant</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Target Cost</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rfq.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productVariant.product.name}</div>
                            <div className="text-xs text-muted-foreground">{item.productVariant.sku}</div>
                          </TableCell>
                          <TableCell>{item.quantityRequested}</TableCell>
                          <TableCell>{item.targetUnitCost || "-"}</TableCell>
                          <TableCell>{item.description || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Supplier Scope</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(rfq.categoryTargets?.length || 0) > 0 ? (
                    <div className="rounded-lg border p-3 text-sm">
                      Categories:{" "}
                      {(rfq.categoryTargets || [])
                        .map((target) => `${target.supplierCategory.name} (${target.supplierCategory.code})`)
                        .join(", ")}
                    </div>
                  ) : null}
                  <div className="rounded-lg border p-3">
                    <div className="text-sm font-medium">Suggested Suppliers</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Category targeting scopes suppliers here, but actual invite happens only when procurement explicitly clicks Invite.
                    </p>
                    <div className="mt-3 space-y-2">
                      {suggestedSuppliers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No supplier matches the targeted categories.</p>
                      ) : (
                        suggestedSuppliers.map((supplier) => {
                          const invited = rfq.supplierInvites.some((invite) => invite.supplierId === supplier.id);
                          return (
                            <div key={supplier.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                              <div className="font-medium">
                                {supplier.name} ({supplier.code})
                              </div>
                              <Badge variant={invited ? "secondary" : "outline"}>
                                {invited ? "Already Invited" : "Suggested"}
                              </Badge>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-sm font-medium">Invited Suppliers</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Only suppliers shown here have received an explicit RFQ invite and can be treated as active invitees.
                    </p>
                    <div className="mt-3 space-y-2">
                  {rfq.supplierInvites.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No supplier invited yet.</p>
                  ) : (
                    rfq.supplierInvites.map((invite) => (
                      <div key={`${invite.supplierId}-${invite.status}`} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {invite.supplier.name} ({invite.supplier.code})
                          </div>
                          <ScmStatusChip status={invite.status} />
                        </div>
                      </div>
                    ))
                  )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {canManage && ["DRAFT", "SUBMITTED"].includes(rfq.status) ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Invite Supplier</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    <select
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      value={inviteSupplier}
                      onChange={(event) => setInviteSupplier(event.target.value)}
                    >
                      <option value="">Invite supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name} ({supplier.code})
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      value={inviteCategory}
                      onChange={(event) => setInviteCategory(event.target.value)}
                    >
                      <option value="">Invite by category</option>
                      {supplierCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name} ({category.code})
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void patchAction("invite_suppliers", {
                          supplierIds: inviteSupplier ? [Number(inviteSupplier)] : [],
                          categoryIds: inviteCategory ? [Number(inviteCategory)] : undefined,
                        })
                      }
                      disabled={saving}
                    >
                      Invite
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="proposals" className="space-y-4">
              {rfq.isBlindReviewActive ? (
                <Card>
                  <CardContent className="pt-6 text-sm text-amber-700 dark:text-amber-300">
                    Blind review is active. Technical and financial proposal details stay hidden until{" "}
                    {fmtDate(rfq.quotationsVisibleAt || rfq.submissionDeadline)}.
                  </CardContent>
                </Card>
              ) : null}

              {!rfq.isBlindReviewActive && canManage && ["SUBMITTED", "CLOSED", "AWARDED"].includes(rfq.status) ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Manual Quotation Entry</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-4">
                    <select
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                      value={quoteSupplier}
                      onChange={(event) => setQuoteSupplier(event.target.value)}
                    >
                      <option value="">Quote supplier</option>
                      {quotationSupplierOptions.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name} ({supplier.code})
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unit cost for all lines"
                      value={quoteUnitCost}
                      onChange={(event) => setQuoteUnitCost(event.target.value)}
                    />
                    <Input
                      placeholder="Quotation note"
                      value={quoteNote}
                      onChange={(event) => setQuoteNote(event.target.value)}
                    />
                    <Button
                      onClick={() =>
                        void patchAction("submit_quotation", {
                          supplierId: Number(quoteSupplier || 0),
                          quotationNote: quoteNote || "",
                          taxTotal: 0,
                          items: rfq.items.map((item) => ({
                            rfqItemId: item.id,
                            quantityQuoted: item.quantityRequested,
                            unitCost: Number(quoteUnitCost || item.targetUnitCost || 0),
                            description: item.description || "",
                          })),
                        })
                      }
                      disabled={saving}
                    >
                      Submit Quotation
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {!rfq.isBlindReviewActive && rfq.quotations.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Evaluation View</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {rfq.quotations.map((quotation) => (
                      <div key={quotation.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {quotation.supplier.name} ({quotation.supplier.code}) • {quotation.total} {quotation.currency}
                            {quotation.revisionNo ? ` • Rev ${quotation.revisionNo}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">{fmtDate(quotation.quotedAt)}</div>
                        </div>
                        {quotation.technicalProposal ? (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Technical: {quotation.technicalProposal}
                          </div>
                        ) : null}
                        {quotation.financialProposal ? (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Financial: {quotation.financialProposal}
                          </div>
                        ) : null}
                        {quotation.note ? <div className="mt-2 text-sm">Note: {quotation.note}</div> : null}
                        {(quotation.attachments?.length || 0) > 0 ? (
                          <div className="mt-3 space-y-1">
                            {quotation.attachments?.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-sm underline-offset-4 hover:underline"
                              >
                                [{attachment.proposalType}] {attachment.label || attachment.fileName || "Attachment"}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>RFQ Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(rfq.attachments?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No RFQ attachment uploaded.</p>
                  ) : (
                    rfq.attachments?.map((attachment) => (
                      <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                        <div>
                          <div className="font-medium">{attachment.label || attachment.fileName || "Attachment"}</div>
                          <div className="text-xs text-muted-foreground">{attachment.fileName || attachment.fileUrl}</div>
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
            </TabsContent>

            <TabsContent value="award" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Award Workspace</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rfq.award ? (
                    <div className="rounded-lg border p-3 text-sm">
                      Awarded to {rfq.award.supplier.name} ({rfq.award.supplier.code})
                      {rfq.award.purchaseOrderId ? " • Purchase order already linked." : " • Purchase order not created yet."}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No award decision recorded yet.</p>
                  )}

                  {canApprove && !rfq.isBlindReviewActive && rfq.quotations.length > 0 ? (
                    <div className="flex gap-2">
                      <select
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        value={awardQuoteId}
                        onChange={(event) => setAwardQuoteId(event.target.value)}
                      >
                        <option value="">Select quotation</option>
                        {rfq.quotations.map((quotation) => (
                          <option key={quotation.id} value={quotation.id}>
                            {quotation.supplier.name} • {quotation.total} {quotation.currency}
                            {quotation.revisionNo ? ` • Rev ${quotation.revisionNo}` : ""}
                          </option>
                        ))}
                      </select>
                      <Button
                        onClick={() =>
                          void patchAction("award", { quotationId: Number(awardQuoteId || 0) })
                        }
                        disabled={saving}
                      >
                        Award
                      </Button>
                    </div>
                  ) : null}

                  {canManage && ["SUBMITTED", "CLOSED", "AWARDED"].includes(rfq.status) && (rfq.resubmissionAllowed ?? true) ? (
                    <div className="grid gap-2 md:grid-cols-[3fr_auto]">
                      <Input
                        placeholder="Resubmission reason"
                        value={resubmissionReason}
                        onChange={(event) => setResubmissionReason(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void patchAction("request_resubmission", {
                            resubmissionReason: resubmissionReason || "",
                          })
                        }
                        disabled={saving}
                      >
                        Request Resubmission
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Linked MRF</div>
                <div className="mt-1">
                  {rfq.purchaseRequisition ? (
                    <Link
                      href={`/admin/scm/purchase-requisitions/${rfq.purchaseRequisition.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {rfq.purchaseRequisition.requisitionNumber}
                    </Link>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Resubmission</div>
                <div className="mt-1">{rfq.resubmissionAllowed ? "Allowed" : "Locked"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Blind Review</div>
                <div className="mt-1">{rfq.isBlindReviewActive ? "Active until deadline" : "Unlocked"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Award Status</div>
                <div className="mt-1">{rfq.award ? `Awarded to ${rfq.award.supplier.code}` : "Pending"}</div>
              </div>
            </CardContent>
          </Card>

          <ScmNextStepPanel
            title={rfq.status}
            subtitle="This panel keeps RFQ workflow actions on the document instead of spreading them across the register."
            emptyMessage="No direct workflow action is available for your current permissions."
            actions={[
              ...(canManage && rfq.status === "DRAFT"
                ? [{ key: "submit", label: "Submit RFQ", variant: "outline" as const, disabled: saving, onClick: () => void patchAction("submit") }]
                : []),
              ...(canManage && ["SUBMITTED", "AWARDED"].includes(rfq.status)
                ? [{ key: "close", label: "Close RFQ", variant: "outline" as const, disabled: saving, onClick: () => void patchAction("close") }]
                : []),
              ...(canManage && ["DRAFT", "SUBMITTED", "CLOSED"].includes(rfq.status)
                ? [{ key: "cancel", label: "Cancel RFQ", variant: "outline" as const, disabled: saving, onClick: () => void patchAction("cancel") }]
                : []),
              ...(canConvertPo && rfq.status === "AWARDED" && rfq.award && !rfq.award.purchaseOrderId
                ? [{ key: "convert_to_po", label: "Convert Award To PO", disabled: saving, onClick: () => void patchAction("convert_to_po") }]
                : []),
            ]}
          />
        </div>
      </div>
    </div>
  );
}
