
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type PurchaseOrder = {
  id: number;
  poNumber: string;
  status: string;
  warehouse: { id: number; name: string; code: string };
  supplier: { id: number; name: string; code: string };
  items: Array<{
    id: number;
    quantityOrdered: number;
    quantityReceived: number;
    productVariant: {
      id: number;
      sku: string;
      product: { id: number; name: string };
    };
  }>;
};

type ReceiptRole = "REQUESTER" | "PROCUREMENT" | "ADMINISTRATION";
type AttachmentType = "CHALLAN" | "BILL" | "OTHER";

type GoodsReceipt = {
  id: number;
  receiptNumber: string;
  status: string;
  receivedAt: string;
  note: string | null;
  requesterConfirmedAt: string | null;
  requesterConfirmationNote: string | null;
  requesterConfirmedBy: { id: string; name: string | null; email: string | null } | null;
  warehouse: { id: number; name: string; code: string };
  purchaseOrder: {
    id: number;
    poNumber: string;
    supplier: { id: number; name: string };
    purchaseRequisition: {
      id: number;
      requisitionNumber: string;
      createdBy: { id: string; name: string | null; email: string | null } | null;
    } | null;
  };
  items: Array<{
    id: number;
    quantityReceived: number;
    productVariant: { sku: string; product: { name: string } };
  }>;
  attachments: Array<{
    id: number;
    type: AttachmentType;
    fileUrl: string;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    note: string | null;
    createdAt: string;
    uploadedBy: { id: string; name: string | null; email: string | null } | null;
  }>;
  vendorEvaluations: Array<{
    id: number;
    evaluatorRole: ReceiptRole;
    overallRating: number;
    serviceQualityRating: number | null;
    deliveryRating: number | null;
    complianceRating: number | null;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: { id: string; name: string | null; email: string | null } | null;
  }>;
  workflow: {
    requesterUserId: string | null;
    requesterConfirmed: boolean;
    canRequesterConfirm: boolean;
    canManageAttachments: boolean;
    allowedEvaluationRoles: ReceiptRole[];
    submittedEvaluationRoles: ReceiptRole[];
    missingEvaluationRoles: ReceiptRole[];
    evaluationCompleted: boolean;
  };
  matchSummary: {
    orderedQuantity: number;
    receivedQuantity: number;
    invoicedQuantity: number;
    invoiceCount: number;
    status: "PENDING" | "MATCHED" | "VARIANCE";
  };
};

type AttachmentDraft = { type: AttachmentType; note: string; file: File | null };
type EvaluationDraft = {
  evaluatorRole: ReceiptRole;
  overallRating: string;
  serviceQualityRating: string;
  deliveryRating: string;
  complianceRating: string;
  comment: string;
};

const ROLE_LABEL: Record<ReceiptRole, string> = {
  REQUESTER: "Requester",
  PROCUREMENT: "Procurement",
  ADMINISTRATION: "Manager Administration",
};

const REQUIRED_ROLES: ReceiptRole[] = ["REQUESTER", "PROCUREMENT", "ADMINISTRATION"];

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  return readJson<T>(response, "Request failed");
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function getInitialEvaluationDraft(allowedRoles: ReceiptRole[]): EvaluationDraft {
  return {
    evaluatorRole: allowedRoles[0] || "REQUESTER",
    overallRating: "5",
    serviceQualityRating: "5",
    deliveryRating: "5",
    complianceRating: "5",
    comment: "",
  };
}

export default function GoodsReceiptsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canManagePosting = permissions.includes("goods_receipts.manage");

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [focus, setFocus] = useState((searchParams.get("focus") || "ALL").toUpperCase());

  const [confirmationNotes, setConfirmationNotes] = useState<Record<number, string>>({});
  const [attachmentDrafts, setAttachmentDrafts] = useState<Record<number, AttachmentDraft>>({});
  const [evaluationDrafts, setEvaluationDrafts] = useState<Record<number, EvaluationDraft>>({});

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
    setFocus((searchParams.get("focus") || "ALL").toUpperCase());
  }, [searchParams]);

  const loadPageData = async () => {
    try {
      setLoading(true);
      const [receiptData, purchaseOrderData] = await Promise.all([
        getJson<GoodsReceipt[]>("/api/scm/goods-receipts"),
        canManagePosting
          ? getJson<PurchaseOrder[]>("/api/scm/purchase-orders")
          : Promise.resolve([] as PurchaseOrder[]),
      ]);
      setReceipts(Array.isArray(receiptData) ? receiptData : []);
      setPurchaseOrders(Array.isArray(purchaseOrderData) ? purchaseOrderData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load receipt data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPageData();
  }, [canManagePosting]);

  const eligiblePurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter((purchaseOrder) =>
        ["APPROVED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status),
      ),
    [purchaseOrders],
  );

  const visibleReceipts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return receipts.filter((receipt) => {
      if (focus === "PENDING-CONFIRMATION" && receipt.requesterConfirmedAt) return false;
      if (focus === "VARIANCE" && receipt.matchSummary.status !== "VARIANCE") return false;
      if (focus === "INCOMPLETE-EVALUATION" && receipt.workflow.evaluationCompleted) return false;
      if (!query) return true;
      return (
        receipt.receiptNumber.toLowerCase().includes(query) ||
        receipt.purchaseOrder.poNumber.toLowerCase().includes(query) ||
        receipt.purchaseOrder.supplier.name.toLowerCase().includes(query.toLowerCase()) ||
        receipt.warehouse.name.toLowerCase().includes(query) ||
        receipt.purchaseOrder.purchaseRequisition?.requisitionNumber
          ?.toLowerCase()
          .includes(query)
      );
    });
  }, [focus, receipts, search]);

  const summary = useMemo(
    () => ({
      total: receipts.length,
      pendingConfirmation: receipts.filter((receipt) => !receipt.requesterConfirmedAt).length,
      variance: receipts.filter((receipt) => receipt.matchSummary.status === "VARIANCE").length,
      incompleteEvaluation: receipts.filter((receipt) => !receipt.workflow.evaluationCompleted).length,
      readyToReceive: eligiblePurchaseOrders.length,
    }),
    [eligiblePurchaseOrders.length, receipts],
  );

  const patchReceipt = async (
    receiptId: number,
    payload: Record<string, unknown>,
    successMessage: string,
    key: string,
  ) => {
    try {
      setBusyKey(key);
      const response = await fetch(`/api/scm/goods-receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readJson(response, "Failed to update goods receipt");
      toast.success(successMessage);
      await loadPageData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update goods receipt");
    } finally {
      setBusyKey(null);
    }
  };

  const getAttachmentDraft = (receiptId: number): AttachmentDraft =>
    attachmentDrafts[receiptId] || { type: "CHALLAN", note: "", file: null };

  const setAttachmentDraft = (receiptId: number, patch: Partial<AttachmentDraft>) => {
    setAttachmentDrafts((prev) => ({
      ...prev,
      [receiptId]: { ...getAttachmentDraft(receiptId), ...patch },
    }));
  };

  const uploadAttachment = async (receipt: GoodsReceipt) => {
    const draft = getAttachmentDraft(receipt.id);
    if (!draft.file) {
      toast.error("Select a file first");
      return;
    }
    const busy = `${receipt.id}:upload_attachment`;
    try {
      setBusyKey(busy);
      const fileUrl = await uploadFile(draft.file, "/api/upload/scm-grn");
      const response = await fetch(`/api/scm/goods-receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_attachment",
          type: draft.type,
          note: draft.note,
          fileUrl,
          fileName: draft.file.name,
          mimeType: draft.file.type || null,
          fileSize: draft.file.size,
        }),
      });
      await readJson(response, "Failed to upload attachment");
      toast.success("Attachment uploaded");
      setAttachmentDrafts((prev) => ({
        ...prev,
        [receipt.id]: { type: draft.type, note: "", file: null },
      }));
      await loadPageData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload attachment");
    } finally {
      setBusyKey(null);
    }
  };

  const getEvaluationDraft = (receipt: GoodsReceipt): EvaluationDraft => {
    const existing = evaluationDrafts[receipt.id];
    if (!existing) return getInitialEvaluationDraft(receipt.workflow.allowedEvaluationRoles);
    if (!receipt.workflow.allowedEvaluationRoles.includes(existing.evaluatorRole)) {
      return {
        ...existing,
        evaluatorRole: receipt.workflow.allowedEvaluationRoles[0] || "REQUESTER",
      };
    }
    return existing;
  };

  const setEvaluationDraft = (
    receipt: GoodsReceipt,
    patch: Partial<EvaluationDraft>,
  ) => {
    setEvaluationDrafts((prev) => ({
      ...prev,
      [receipt.id]: { ...getEvaluationDraft(receipt), ...patch },
    }));
  };

  const submitEvaluation = async (receipt: GoodsReceipt) => {
    const draft = getEvaluationDraft(receipt);
    if (!receipt.workflow.allowedEvaluationRoles.includes(draft.evaluatorRole)) {
      toast.error("You cannot submit this evaluator role");
      return;
    }
    await patchReceipt(
      receipt.id,
      {
        action: "submit_evaluation",
        evaluatorRole: draft.evaluatorRole,
        overallRating: Number(draft.overallRating),
        serviceQualityRating: draft.serviceQualityRating
          ? Number(draft.serviceQualityRating)
          : null,
        deliveryRating: draft.deliveryRating ? Number(draft.deliveryRating) : null,
        complianceRating: draft.complianceRating
          ? Number(draft.complianceRating)
          : null,
        comment: draft.comment,
      },
      `${ROLE_LABEL[draft.evaluatorRole]} evaluation submitted`,
      `${receipt.id}:submit_evaluation`,
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goods Receiving Note (GRN)</h1>
          <p className="text-sm text-muted-foreground">
            Receive goods, requester confirmation, WO-vs-delivery-vs-invoice check, challan/bill upload, and 3-role vendor evaluation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManagePosting ? (
            <Button asChild>
              <Link href="/admin/scm/goods-receipts/new">
                <Plus className="mr-2 h-4 w-4" />
                New GRN
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void loadPageData()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ScmStatCard label="Total GRN" value={String(summary.total)} hint="Visible receipt register" />
        <ScmStatCard label="Pending Confirmation" value={String(summary.pendingConfirmation)} hint="Requester still needs to confirm" />
        <ScmStatCard label="Variance" value={String(summary.variance)} hint="WO vs delivery vs invoice mismatch" />
        <ScmStatCard label="Evaluation Pending" value={String(summary.incompleteEvaluation)} hint="One or more roles still missing" />
        <ScmStatCard label="Ready To Receive" value={String(summary.readyToReceive)} hint="Approved PO still open for receipt" />
      </div>

      {focus !== "ALL" || search.trim() ? (
        <Card className="border-amber-200 bg-amber-50/60 shadow-none">
          <CardContent className="flex flex-col gap-2 p-4 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-foreground">Focused queue active</p>
              <p className="text-muted-foreground">
                {focus === "PENDING-CONFIRMATION"
                  ? "Showing receipts that still need requester confirmation."
                  : focus === "VARIANCE"
                    ? "Showing receipts with PO vs delivery vs invoice mismatch."
                    : focus === "INCOMPLETE-EVALUATION"
                      ? "Showing receipts missing one or more evaluation roles."
                      : focus === "POST"
                        ? "Use the guided GRN creation page to post a new inbound receipt."
                        : "Showing a filtered goods receipt queue."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManagePosting && focus === "POST" ? (
                <Button asChild>
                  <Link href="/admin/scm/goods-receipts/new">Open GRN Creator</Link>
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  setFocus("ALL");
                  setSearch("");
                }}
              >
                Clear Focus
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>GRN Register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <Input
              placeholder="Search receipt, PO, supplier, requisition, or warehouse..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
            >
              <option value="ALL">All queues</option>
              <option value="PENDING-CONFIRMATION">Pending confirmation</option>
              <option value="VARIANCE">Variance</option>
              <option value="INCOMPLETE-EVALUATION">Evaluation pending</option>
              {canManagePosting ? <option value="POST">Ready to post</option> : null}
            </select>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {visibleReceipts.length} visible receipt{visibleReceipts.length === 1 ? "" : "s"}
            </div>
            <Button variant="outline" onClick={() => void loadPageData()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading goods receipts...</p>
          ) : visibleReceipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goods receipts found.</p>
          ) : (
            <div className="space-y-4">
              {visibleReceipts.map((receipt) => {
                const attachmentDraft = getAttachmentDraft(receipt.id);
                const evaluationDraft = getEvaluationDraft(receipt);
                const evaluationsByRole = new Map(
                  receipt.vendorEvaluations.map((item) => [item.evaluatorRole, item]),
                );

                return (
                  <div key={receipt.id} className="space-y-4 rounded-lg border p-4">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-semibold">{receipt.receiptNumber}</div>
                        <div className="text-sm text-muted-foreground">{receipt.purchaseOrder.poNumber} • {receipt.purchaseOrder.supplier.name}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/scm/goods-receipts/${receipt.id}`}>Open Detail</Link>
                        </Button>
                        <ScmStatusChip status={receipt.matchSummary.status} />
                        <span>{fmtDate(receipt.receivedAt)} • {receipt.warehouse.code}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-md border p-3 text-sm md:grid-cols-3">
                      <div>
                        <p className="font-medium">WO vs Delivered vs Invoice</p>
                        <p className="text-muted-foreground">Ordered {receipt.matchSummary.orderedQuantity} | Delivered {receipt.matchSummary.receivedQuantity} | Invoiced {receipt.matchSummary.invoicedQuantity}</p>
                        <p className="text-muted-foreground">Invoices {receipt.matchSummary.invoiceCount} | Match {receipt.matchSummary.status}</p>
                      </div>
                      <div>
                        <p className="font-medium">Requester Confirmation</p>
                        <p className="text-muted-foreground">{receipt.requesterConfirmedAt ? `Confirmed at ${fmtDate(receipt.requesterConfirmedAt)}` : "Pending requester confirmation"}</p>
                        {receipt.requesterConfirmedBy ? <p className="text-muted-foreground">By {receipt.requesterConfirmedBy.name || receipt.requesterConfirmedBy.email || "N/A"}</p> : null}
                      </div>
                      <div>
                        <p className="font-medium">Evaluation Completion</p>
                        <p className="text-muted-foreground">{receipt.workflow.evaluationCompleted ? "All three roles completed" : `Pending: ${receipt.workflow.missingEvaluationRoles.map((role) => ROLE_LABEL[role]).join(", ") || "N/A"}`}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Qty Received</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {receipt.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="font-medium">{item.productVariant.product.name}</div>
                                <div className="text-xs text-muted-foreground">{item.productVariant.sku}</div>
                              </TableCell>
                              <TableCell>{item.quantityReceived}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 rounded-md border p-3">
                        <p className="font-medium">Requester Review & Confirmation</p>
                        {receipt.requesterConfirmationNote ? <p className="text-sm text-muted-foreground">Note: {receipt.requesterConfirmationNote}</p> : null}
                        {receipt.workflow.canRequesterConfirm ? (
                          <>
                            <Textarea
                              rows={3}
                              placeholder="Requester confirmation note (optional)"
                              value={confirmationNotes[receipt.id] || ""}
                              onChange={(event) =>
                                setConfirmationNotes((prev) => ({ ...prev, [receipt.id]: event.target.value }))
                              }
                            />
                            <Button
                              onClick={() =>
                                void patchReceipt(
                                  receipt.id,
                                  { action: "requester_confirm", note: confirmationNotes[receipt.id] || "" },
                                  "Requester confirmation submitted",
                                  `${receipt.id}:requester_confirm`,
                                )
                              }
                              disabled={busyKey === `${receipt.id}:requester_confirm`}
                            >
                              Confirm GRN
                            </Button>
                          </>
                        ) : null}
                      </div>

                      <div className="space-y-2 rounded-md border p-3">
                        <p className="font-medium">Challan / Bill Attachments</p>
                        {receipt.attachments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No attachments yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {receipt.attachments.map((attachment) => (
                              <div key={attachment.id} className="rounded border p-2 text-sm">
                                <p className="font-medium">{attachment.type} • {attachment.fileName || "Attachment"}</p>
                                <p className="text-muted-foreground">Uploaded {fmtDate(attachment.createdAt)} by {attachment.uploadedBy?.name || attachment.uploadedBy?.email || "N/A"}</p>
                                {attachment.note ? <p className="text-muted-foreground">Note: {attachment.note}</p> : null}
                                <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="text-primary underline">View file</a>
                              </div>
                            ))}
                          </div>
                        )}

                        {receipt.workflow.canManageAttachments ? (
                          <div className="space-y-2 rounded border p-2">
                            <div className="grid gap-2 md:grid-cols-2">
                              <select
                                className="h-10 rounded-md border bg-background px-3 text-sm"
                                value={attachmentDraft.type}
                                onChange={(event) => setAttachmentDraft(receipt.id, { type: event.target.value as AttachmentType })}
                              >
                                <option value="CHALLAN">CHALLAN</option>
                                <option value="BILL">BILL</option>
                                <option value="OTHER">OTHER</option>
                              </select>
                              <Input
                                type="file"
                                onChange={(event) => setAttachmentDraft(receipt.id, { file: event.target.files?.[0] || null })}
                              />
                            </div>
                            <Textarea
                              rows={2}
                              placeholder="Attachment note (optional)"
                              value={attachmentDraft.note}
                              onChange={(event) => setAttachmentDraft(receipt.id, { note: event.target.value })}
                            />
                            <Button onClick={() => void uploadAttachment(receipt)} disabled={busyKey === `${receipt.id}:upload_attachment`}>
                              {busyKey === `${receipt.id}:upload_attachment` ? "Uploading..." : "Upload Attachment"}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-md border p-3">
                      <p className="font-medium">Vendor Performance Evaluation (1-5)</p>
                      <div className="grid gap-2 md:grid-cols-3">
                        {REQUIRED_ROLES.map((role) => {
                          const row = evaluationsByRole.get(role);
                          return (
                            <div key={role} className="rounded border p-2 text-sm">
                              <p className="font-medium">{ROLE_LABEL[role]}</p>
                              {row ? (
                                <>
                                  <p className="text-muted-foreground">Overall {row.overallRating}/5</p>
                                  <p className="text-muted-foreground">Service {row.serviceQualityRating ?? "N/A"} | Delivery {row.deliveryRating ?? "N/A"} | Compliance {row.complianceRating ?? "N/A"}</p>
                                  <p className="text-muted-foreground">By {row.createdBy?.name || row.createdBy?.email || "N/A"} at {fmtDate(row.updatedAt)}</p>
                                </>
                              ) : (
                                <p className="text-muted-foreground">Pending</p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {receipt.workflow.allowedEvaluationRoles.length > 0 ? (
                        <div className="space-y-2 rounded border p-3">
                          <div className="grid gap-2 md:grid-cols-5">
                            <select
                              className="h-10 rounded-md border bg-background px-3 text-sm"
                              value={evaluationDraft.evaluatorRole}
                              onChange={(event) => setEvaluationDraft(receipt, { evaluatorRole: event.target.value as ReceiptRole })}
                            >
                              {receipt.workflow.allowedEvaluationRoles.map((role) => (
                                <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                              ))}
                            </select>
                            <Input type="number" min={1} max={5} placeholder="Overall" value={evaluationDraft.overallRating} onChange={(event) => setEvaluationDraft(receipt, { overallRating: event.target.value })} />
                            <Input type="number" min={1} max={5} placeholder="Service" value={evaluationDraft.serviceQualityRating} onChange={(event) => setEvaluationDraft(receipt, { serviceQualityRating: event.target.value })} />
                            <Input type="number" min={1} max={5} placeholder="Delivery" value={evaluationDraft.deliveryRating} onChange={(event) => setEvaluationDraft(receipt, { deliveryRating: event.target.value })} />
                            <Input type="number" min={1} max={5} placeholder="Compliance" value={evaluationDraft.complianceRating} onChange={(event) => setEvaluationDraft(receipt, { complianceRating: event.target.value })} />
                          </div>
                          <Textarea
                            rows={2}
                            placeholder="Evaluation note (optional)"
                            value={evaluationDraft.comment}
                            onChange={(event) => setEvaluationDraft(receipt, { comment: event.target.value })}
                          />
                          <Button onClick={() => void submitEvaluation(receipt)} disabled={busyKey === `${receipt.id}:submit_evaluation`}>
                            {busyKey === `${receipt.id}:submit_evaluation` ? "Submitting..." : "Submit Evaluation"}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">You do not have an evaluation role for this GRN.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
