"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { uploadFile } from "@/lib/upload-file";

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type Variant = {
  id: number;
  sku: string;
  productId: number;
  stock: number;
  product?: {
    id: number;
    name: string;
  };
};

type DraftItem = {
  productVariantId: string;
  quantityRequested: string;
  description: string;
};

type RequisitionAttachmentDraft = {
  file?: File;
  fileUrl?: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  note?: string;
};

const emptyLine = (): DraftItem => ({
  productVariantId: "",
  quantityRequested: "1",
  description: "",
});

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

export default function NewPurchaseRequisitionPage() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [warehouseId, setWarehouseId] = useState("");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [budgetCode, setBudgetCode] = useState("");
  const [boqReference, setBoqReference] = useState("");
  const [specification, setSpecification] = useState("");
  const [planningNote, setPlanningNote] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [endorsementRequiredCount, setEndorsementRequiredCount] = useState("1");
  const [neededBy, setNeededBy] = useState("");
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<RequisitionAttachmentDraft[]>([]);
  const [items, setItems] = useState<DraftItem[]>([emptyLine()]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [warehousesRes, variantsRes] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }),
        fetch("/api/product-variants", { cache: "no-store" }),
      ]);
      const [warehouseData, variantData] = await Promise.all([
        readJson<Warehouse[]>(warehousesRes, "Failed to load warehouses"),
        readJson<Variant[]>(variantsRes, "Failed to load variants"),
      ]);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setVariants(Array.isArray(variantData) ? variantData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load requisition setup data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === Number(warehouseId)) ?? null,
    [warehouseId, warehouses],
  );

  const selectedItems = useMemo(() => {
    return items
      .map((item) => ({
        ...item,
        variant: variants.find((variant) => variant.id === Number(item.productVariantId)) ?? null,
      }))
      .filter((item) => item.variant);
  }, [items, variants]);

  const updateItem = (index: number, key: keyof DraftItem, value: string) => {
    setItems((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    );
  };

  const addAttachmentRows = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = [...files].slice(0, 20).map((file) => ({
      file,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      note: "",
    }));
    setAttachments((prev) => [...prev, ...next].slice(0, 20));
  };

  const updateAttachmentNote = (index: number, value: string) => {
    setAttachments((prev) =>
      prev.map((attachment, itemIndex) =>
        itemIndex === index ? { ...attachment, note: value } : attachment,
      ),
    );
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const resetForm = () => {
    setWarehouseId("");
    setTitle("");
    setPurpose("");
    setBudgetCode("");
    setBoqReference("");
    setSpecification("");
    setPlanningNote("");
    setEstimatedAmount("");
    setEndorsementRequiredCount("1");
    setNeededBy("");
    setNote("");
    setAttachments([]);
    setItems([emptyLine()]);
  };

  const deleteLocalUpload = (fileUrl: string) => {
    if (!fileUrl.startsWith("/upload/")) return Promise.resolve();
    return fetch(`/api/delete-file?path=${encodeURIComponent(fileUrl.replace(/^\//, ""))}`, {
      method: "DELETE",
    }).catch(() => undefined);
  };

  const createRequisition = async () => {
    if (!warehouseId) {
      toast.error("Warehouse is required");
      return;
    }

    const validItems = items.filter((item) => item.productVariantId && Number(item.quantityRequested) > 0);
    if (validItems.length === 0) {
      toast.error("At least one valid line item is required");
      return;
    }

    const uploadedFileUrls: string[] = [];
    try {
      setSaving(true);
      const uploadedAttachments = [];
      for (const attachment of attachments) {
        if (!attachment.file) continue;
        const fileUrl = await uploadFile(attachment.file);
        uploadedFileUrls.push(fileUrl);
        uploadedAttachments.push({
          fileUrl,
          fileName: attachment.fileName || attachment.file.name,
          mimeType: attachment.mimeType || attachment.file.type || null,
          fileSize: attachment.fileSize || attachment.file.size || null,
          note: attachment.note?.trim() || null,
        });
      }

      const response = await fetch("/api/scm/purchase-requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: Number(warehouseId),
          title,
          purpose,
          budgetCode,
          boqReference,
          specification,
          planningNote,
          estimatedAmount: estimatedAmount || null,
          endorsementRequiredCount: Number(endorsementRequiredCount || 1),
          neededBy: neededBy || null,
          note,
          attachments: uploadedAttachments,
          items: validItems.map((item) => ({
            productVariantId: Number(item.productVariantId),
            quantityRequested: Number(item.quantityRequested),
            description: item.description,
          })),
        }),
      });

      const created = await readJson<{ id: number }>(response, "Failed to create purchase requisition");
      toast.success("Purchase requisition created");
      router.push(`/admin/scm/purchase-requisitions/${created.id}`);
    } catch (error: any) {
      await Promise.all(uploadedFileUrls.map((fileUrl) => deleteLocalUpload(fileUrl)));
      toast.error(error?.message || "Failed to create purchase requisition");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/scm/purchase-requisitions">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back To Register
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Purchase Requisition</h1>
            <p className="text-sm text-muted-foreground">
              Build the requisition in sequence: planning, line items, supporting documents, then save the draft.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetForm} disabled={saving}>
            Clear
          </Button>
          <Button onClick={() => void createRequisition()} disabled={saving || loading}>
            {saving ? "Saving..." : "Create Draft"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Warehouse" value={selectedWarehouse?.name || "Not selected"} hint={selectedWarehouse?.code || "Choose operating warehouse"} />
        <ScmStatCard label="Line Items" value={String(selectedItems.length)} hint="Validated procurement lines" />
        <ScmStatCard label="Attachments" value={String(attachments.length)} hint="Supporting documents uploaded" />
        <ScmStatCard label="Estimated Amount" value={estimatedAmount || "0.00"} hint={budgetCode || "Budget code pending"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Planning Context</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>MRF Title</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="April apparel refill" />
              </div>
              <div>
                <Label>Warehouse</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                  <option value="">Select warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Purpose</Label>
                <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Festival stock refill" />
              </div>
              <div>
                <Label>Needed By</Label>
                <Input type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} />
              </div>
              <div>
                <Label>Budget Code</Label>
                <Input value={budgetCode} onChange={(event) => setBudgetCode(event.target.value)} placeholder="BUD-APP-2026-04" />
              </div>
              <div>
                <Label>BOQ Reference</Label>
                <Input value={boqReference} onChange={(event) => setBoqReference(event.target.value)} placeholder="BOQ-APR-01" />
              </div>
              <div>
                <Label>Estimated Amount</Label>
                <Input type="number" min="0" step="0.01" value={estimatedAmount} onChange={(event) => setEstimatedAmount(event.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>Required Endorsements</Label>
                <Input type="number" min="1" value={endorsementRequiredCount} onChange={(event) => setEndorsementRequiredCount(event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Specification</Label>
                <Textarea rows={4} value={specification} onChange={(event) => setSpecification(event.target.value)} placeholder="Technical specification and quality requirements..." />
              </div>
              <div className="md:col-span-2">
                <Label>Planning Note</Label>
                <Textarea rows={4} value={planningNote} onChange={(event) => setPlanningNote(event.target.value)} placeholder="Procurement planning assumptions, project reference, or sourcing note..." />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Select exact variants and quantities. Duplicate variants are discouraged.</p>
                <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyLine()])}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Line
                </Button>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_1fr_2fr_auto]">
                  <div>
                    <Label>Variant</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2" value={item.productVariantId} onChange={(event) => updateItem(index, "productVariantId", event.target.value)}>
                      <option value="">Select variant</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.product?.name || "Variant"} ({variant.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Qty</Label>
                    <Input type="number" min="1" value={item.quantityRequested} onChange={(event) => updateItem(index, "quantityRequested", event.target.value)} />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} placeholder="Optional internal description" />
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" size="icon" onClick={() => setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)))} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Supporting Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-dashed p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Paperclip className="h-4 w-4" />
                  Upload supporting files
                </div>
                <Input type="file" multiple onChange={(event) => addAttachmentRows(event.target.files)} />
                <p className="mt-2 text-xs text-muted-foreground">Up to 20 files. Notes can be added per file.</p>
              </div>
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((attachment, index) => (
                    <div key={`${attachment.fileName}-${index}`} className="grid gap-2 rounded-md border p-2 md:grid-cols-[2fr_3fr_auto]">
                      <div className="text-sm text-muted-foreground">{attachment.fileName}</div>
                      <Input placeholder="Attachment note (optional)" value={attachment.note || ""} onChange={(event) => updateAttachmentNote(index, event.target.value)} />
                      <Button type="button" variant="outline" size="sm" onClick={() => removeAttachment(index)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <Label>Notes</Label>
                <Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="General note for the requisition..." />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Submission Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className={warehouseId ? "text-foreground" : "text-muted-foreground"}>1. Warehouse selected</div>
              <div className={selectedItems.length > 0 ? "text-foreground" : "text-muted-foreground"}>2. At least one line item added</div>
              <div className={purpose ? "text-foreground" : "text-muted-foreground"}>3. Purpose captured</div>
              <div className={budgetCode ? "text-foreground" : "text-muted-foreground"}>4. Budget code captured</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Draft Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Warehouse</div>
                <div className="mt-1 font-medium">{selectedWarehouse ? `${selectedWarehouse.name} (${selectedWarehouse.code})` : "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Needed By</div>
                <div className="mt-1 font-medium">{neededBy || "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Lines</div>
                <div className="mt-1 font-medium">{selectedItems.length}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Attachments</div>
                <div className="mt-1 font-medium">{attachments.length}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
