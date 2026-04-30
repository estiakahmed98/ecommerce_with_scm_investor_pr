"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/lib/upload-file";

type SupplierRfqRow = {
  id: number;
  rfqNumber: string;
  status: string;
  currency: string;
  requestedAt: string;
  submissionDeadline: string | null;
  isSubmissionWindowOpen?: boolean;
  isSubmissionDeadlinePassed?: boolean;
  note: string | null;
  canSubmitQuote: boolean;
  warehouse: {
    id: number;
    name: string;
    code: string;
  };
  invite: {
    id: number;
    status: string;
    invitedAt: string;
    respondedAt: string | null;
    resubmissionRequestedAt?: string | null;
    resubmissionReason?: string | null;
    note: string | null;
  } | null;
  items: Array<{
    id: number;
    description: string | null;
    quantityRequested: number;
    targetUnitCost: string | null;
    variantId: number;
    sku: string;
    productName: string;
  }>;
  quotation: {
    id: number;
    status: string;
    revisionNo?: number;
    quotedAt: string;
    validUntil: string | null;
    subtotal: string;
    taxTotal: string;
    total: string;
    currency: string;
    note: string | null;
    technicalProposal?: string | null;
    financialProposal?: string | null;
    items: Array<{
      id: number;
      rfqItemId: number;
      productVariantId: number;
      quantityQuoted: number;
      unitCost: string;
      lineTotal: string;
      description: string | null;
    }>;
    attachments?: Array<{
      id: number;
      proposalType: "TECHNICAL" | "FINANCIAL" | "SUPPORTING";
      label: string | null;
      fileUrl: string;
      fileName: string | null;
      mimeType: string | null;
      fileSize: number | null;
      createdAt: string;
    }>;
  } | null;
  award: {
    id: number;
    supplierId: number;
    status: string;
    awardedAt: string;
    purchaseOrderId: number | null;
    purchaseOrder: {
      id: number;
      poNumber: string;
      status: string;
    } | null;
    isAwardedToCurrentSupplier: boolean;
  } | null;
};

type ProposalAttachmentType = "TECHNICAL" | "FINANCIAL" | "SUPPORTING";

type ProposalAttachmentDraft = {
  file: File;
  proposalType: ProposalAttachmentType;
  label: string;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function SupplierRfqsPage() {
  const [rows, setRows] = useState<SupplierRfqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [lineQty, setLineQty] = useState<Record<string, string>>({});
  const [lineUnitCost, setLineUnitCost] = useState<Record<string, string>>({});
  const [lineDesc, setLineDesc] = useState<Record<string, string>>({});
  const [quoteNote, setQuoteNote] = useState<Record<number, string>>({});
  const [quoteTechnical, setQuoteTechnical] = useState<Record<number, string>>({});
  const [quoteFinancial, setQuoteFinancial] = useState<Record<number, string>>({});
  const [quoteValidUntil, setQuoteValidUntil] = useState<Record<number, string>>({});
  const [quoteTax, setQuoteTax] = useState<Record<number, string>>({});
  const [proposalAttachments, setProposalAttachments] = useState<
    Record<number, ProposalAttachmentDraft[]>
  >({});

  const loadRfqs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);

      const response = await fetch(
        `/api/supplier/rfqs${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load RFQs.");
      }

      const data = Array.isArray(payload) ? (payload as SupplierRfqRow[]) : [];
      setRows(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load RFQs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRfqs();
  }, [search, statusFilter]);

  useEffect(() => {
    const nextQty = { ...lineQty };
    const nextUnitCost = { ...lineUnitCost };
    const nextDesc = { ...lineDesc };
    const nextNote = { ...quoteNote };
    const nextTechnical = { ...quoteTechnical };
    const nextFinancial = { ...quoteFinancial };
    const nextValidUntil = { ...quoteValidUntil };
    const nextTax = { ...quoteTax };

    for (const rfq of rows) {
      if (nextNote[rfq.id] === undefined) {
        nextNote[rfq.id] = rfq.quotation?.note ?? "";
      }
      if (nextTechnical[rfq.id] === undefined) {
        nextTechnical[rfq.id] = rfq.quotation?.technicalProposal ?? "";
      }
      if (nextFinancial[rfq.id] === undefined) {
        nextFinancial[rfq.id] = rfq.quotation?.financialProposal ?? "";
      }
      if (nextValidUntil[rfq.id] === undefined) {
        nextValidUntil[rfq.id] = rfq.quotation?.validUntil
          ? rfq.quotation.validUntil.slice(0, 16)
          : "";
      }
      if (nextTax[rfq.id] === undefined) {
        nextTax[rfq.id] = rfq.quotation?.taxTotal ?? "0";
      }

      for (const item of rfq.items) {
        const key = `${rfq.id}:${item.id}`;
        const existingQuoteLine = rfq.quotation?.items.find(
          (quoteLine) => quoteLine.rfqItemId === item.id,
        );
        if (nextQty[key] === undefined) {
          nextQty[key] = String(
            existingQuoteLine?.quantityQuoted ?? item.quantityRequested,
          );
        }
        if (nextUnitCost[key] === undefined) {
          nextUnitCost[key] = existingQuoteLine?.unitCost ?? item.targetUnitCost ?? "";
        }
        if (nextDesc[key] === undefined) {
          nextDesc[key] = existingQuoteLine?.description ?? item.description ?? "";
        }
      }
    }

    setLineQty(nextQty);
    setLineUnitCost(nextUnitCost);
    setLineDesc(nextDesc);
    setQuoteNote(nextNote);
    setQuoteTechnical(nextTechnical);
    setQuoteFinancial(nextFinancial);
    setQuoteValidUntil(nextValidUntil);
    setQuoteTax(nextTax);
  }, [rows]);

  const statusOptions = useMemo(
    () => ["SUBMITTED", "CLOSED", "AWARDED", "CANCELLED", "DRAFT"],
    [],
  );

  const addProposalAttachment = (rfqId: number, file: File) => {
    setProposalAttachments((current) => ({
      ...current,
      [rfqId]: [
        ...(current[rfqId] || []),
        {
          file,
          proposalType: "SUPPORTING",
          label: "",
        },
      ],
    }));
  };

  const updateProposalAttachment = (
    rfqId: number,
    index: number,
    patch: Partial<ProposalAttachmentDraft>,
  ) => {
    setProposalAttachments((current) => ({
      ...current,
      [rfqId]: (current[rfqId] || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeProposalAttachment = (rfqId: number, index: number) => {
    setProposalAttachments((current) => ({
      ...current,
      [rfqId]: (current[rfqId] || []).filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submitQuote = async (rfq: SupplierRfqRow) => {
    try {
      const items = rfq.items.map((item) => {
        const key = `${rfq.id}:${item.id}`;
        const quantityQuoted = Number(lineQty[key] || "");
        const unitCost = Number(lineUnitCost[key] || "");
        if (!Number.isInteger(quantityQuoted) || quantityQuoted <= 0) {
          throw new Error(`Invalid quoted quantity for ${item.productName}.`);
        }
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error(`Invalid unit cost for ${item.productName}.`);
        }
        return {
          rfqItemId: item.id,
          quantityQuoted,
          unitCost,
          description: lineDesc[key] || item.description || "",
        };
      });
      const uploadedAttachments: Array<{
        proposalType: ProposalAttachmentType;
        label: string | null;
        fileUrl: string;
        fileName: string | null;
        mimeType: string | null;
        fileSize: number | null;
      }> = [];
      const draftAttachments = proposalAttachments[rfq.id] || [];
      for (const attachment of draftAttachments) {
        const fileUrl = await uploadFile(
          attachment.file,
          "/api/upload/scm-proposals",
        );
        uploadedAttachments.push({
          proposalType: attachment.proposalType,
          label: attachment.label.trim() || null,
          fileUrl,
          fileName: attachment.file.name,
          mimeType: attachment.file.type || null,
          fileSize: attachment.file.size,
        });
      }
      const existingAttachments =
        rfq.quotation?.attachments?.map((attachment) => ({
          proposalType: attachment.proposalType,
          label: attachment.label ?? null,
          fileUrl: attachment.fileUrl,
          fileName: attachment.fileName ?? null,
          mimeType: attachment.mimeType ?? null,
          fileSize: attachment.fileSize ?? null,
        })) ?? [];

      setSubmittingId(rfq.id);
      const response = await fetch("/api/supplier/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfqId: rfq.id,
          validUntil: quoteValidUntil[rfq.id] || null,
          quotationNote: quoteNote[rfq.id] || "",
          technicalProposal: quoteTechnical[rfq.id] || "",
          financialProposal: quoteFinancial[rfq.id] || "",
          taxTotal: Number(quoteTax[rfq.id] || 0),
          currency: rfq.currency,
          attachments: [...existingAttachments, ...uploadedAttachments],
          items,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit quotation.");
      }

      toast.success(`Quotation submitted for ${rfq.rfqNumber}`);
      setProposalAttachments((current) => ({ ...current, [rfq.id]: [] }));
      await loadRfqs();
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit quotation.");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">RFQ Invitations</h1>
          <p className="text-sm text-muted-foreground">
            Review invited RFQs and submit your quotation securely.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadRfqs()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Search</Label>
          <Input
            placeholder="RFQ number or warehouse..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading RFQs...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No RFQs found for your supplier account.
              </CardContent>
            </Card>
          ) : (
            rows.map((rfq) => (
              <Card key={rfq.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{rfq.rfqNumber}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{rfq.status}</Badge>
                      {rfq.award?.isAwardedToCurrentSupplier ? (
                        <Badge>Awarded To You</Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {rfq.warehouse.name} ({rfq.warehouse.code}) | Deadline:{" "}
                    {fmtDate(rfq.submissionDeadline)}
                  </p>
                  {rfq.isSubmissionDeadlinePassed ? (
                    <p className="text-xs text-destructive">
                      Submission window closed. Proposal is locked after deadline.
                    </p>
                  ) : null}
                  {rfq.invite?.resubmissionReason ? (
                    <p className="text-xs text-amber-600">
                      Resubmission request: {rfq.invite.resubmissionReason}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr className="border-b">
                          <th className="pb-2">Item</th>
                          <th className="pb-2">Requested</th>
                          <th className="pb-2">Quoted Qty</th>
                          <th className="pb-2">Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rfq.items.map((item) => {
                          const key = `${rfq.id}:${item.id}`;
                          return (
                            <tr key={item.id} className="border-b">
                              <td className="py-2">
                                <div className="font-medium">{item.productName}</div>
                                <div className="text-xs text-muted-foreground">{item.sku}</div>
                              </td>
                              <td className="py-2">{item.quantityRequested}</td>
                              <td className="py-2">
                                <Input
                                  type="number"
                                  min={1}
                                  value={lineQty[key] ?? ""}
                                  onChange={(event) =>
                                    setLineQty((current) => ({
                                      ...current,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                                />
                              </td>
                              <td className="py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={lineUnitCost[key] ?? ""}
                                  onChange={(event) =>
                                    setLineUnitCost((current) => ({
                                      ...current,
                                      [key]: event.target.value,
                                    }))
                                  }
                                  disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Valid Until</Label>
                      <Input
                        type="datetime-local"
                        value={quoteValidUntil[rfq.id] ?? ""}
                        onChange={(event) =>
                          setQuoteValidUntil((current) => ({
                            ...current,
                            [rfq.id]: event.target.value,
                          }))
                        }
                        disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Tax Total</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={quoteTax[rfq.id] ?? "0"}
                        onChange={(event) =>
                          setQuoteTax((current) => ({
                            ...current,
                            [rfq.id]: event.target.value,
                          }))
                        }
                        disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Quotation Note</Label>
                    <Textarea
                      value={quoteNote[rfq.id] ?? ""}
                      onChange={(event) =>
                        setQuoteNote((current) => ({
                          ...current,
                          [rfq.id]: event.target.value,
                        }))
                      }
                      disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Technical Proposal</Label>
                      <Textarea
                        value={quoteTechnical[rfq.id] ?? ""}
                        onChange={(event) =>
                          setQuoteTechnical((current) => ({
                            ...current,
                            [rfq.id]: event.target.value,
                          }))
                        }
                        placeholder="Technical approach, compliance, delivery capability, QA plan..."
                        disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Financial Proposal</Label>
                      <Textarea
                        value={quoteFinancial[rfq.id] ?? ""}
                        onChange={(event) =>
                          setQuoteFinancial((current) => ({
                            ...current,
                            [rfq.id]: event.target.value,
                          }))
                        }
                        placeholder="Commercial terms, validity assumptions, exclusions..."
                        disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <div className="text-sm font-medium">Proposal Attachments</div>
                    <Input
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        addProposalAttachment(rfq.id, file);
                        event.target.value = "";
                      }}
                      disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                    />
                    {(proposalAttachments[rfq.id] || []).length > 0 ? (
                      <div className="space-y-2">
                        {(proposalAttachments[rfq.id] || []).map((attachment, index) => (
                          <div key={`${attachment.file.name}-${index}`} className="grid gap-2 md:grid-cols-[2fr_1fr_2fr_auto]">
                            <div className="text-xs">{attachment.file.name}</div>
                            <select
                              className="rounded-md border bg-background px-2 py-1 text-xs"
                              value={attachment.proposalType}
                              onChange={(event) =>
                                updateProposalAttachment(rfq.id, index, {
                                  proposalType: event.target.value as ProposalAttachmentType,
                                })
                              }
                              disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                            >
                              <option value="TECHNICAL">TECHNICAL</option>
                              <option value="FINANCIAL">FINANCIAL</option>
                              <option value="SUPPORTING">SUPPORTING</option>
                            </select>
                            <Input
                              placeholder="Label (optional)"
                              value={attachment.label}
                              onChange={(event) =>
                                updateProposalAttachment(rfq.id, index, {
                                  label: event.target.value,
                                })
                              }
                              disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                            />
                            <Button
                              variant="outline"
                              onClick={() => removeProposalAttachment(rfq.id, index)}
                              disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {(rfq.quotation?.attachments?.length || 0) > 0 ? (
                      <div className="space-y-1 text-xs">
                        <div className="font-medium text-muted-foreground">
                          Existing uploaded documents
                        </div>
                        {rfq.quotation?.attachments?.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-primary underline"
                          >
                            [{attachment.proposalType}]{" "}
                            {attachment.label || attachment.fileName || "Attachment"}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => void submitQuote(rfq)}
                      disabled={!rfq.canSubmitQuote || submittingId === rfq.id}
                    >
                      {submittingId === rfq.id ? "Submitting..." : "Submit / Update Quote"}
                    </Button>
                    {rfq.quotation ? (
                      <p className="text-sm text-muted-foreground">
                        Last quote total: {rfq.quotation.total} {rfq.quotation.currency}
                        {rfq.quotation.revisionNo ? ` • Rev ${rfq.quotation.revisionNo}` : ""} at{" "}
                        {fmtDate(rfq.quotation.quotedAt)}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
