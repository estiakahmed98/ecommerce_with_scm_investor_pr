"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/upload-file";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScmSectionHeader } from "@/components/admin/scm/ScmSectionHeader";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type Variant = {
  id: number;
  sku: string;
  product?: {
    id: number;
    name: string;
    inventoryItemClass?: "CONSUMABLE" | "PERMANENT";
    requiresAssetTag?: boolean;
  };
};

type MaterialRequest = {
  id: number;
  requestNumber: string;
};

type DraftItem = {
  productVariantId: string;
  quantityRequested: string;
  description: string;
};

type AttachmentDraft = {
  file: File;
  note: string;
};

const MATERIAL_UPLOAD_ENDPOINT = "/api/upload/scm-material/material-requests";

const emptyLine = (): DraftItem => ({
  productVariantId: "",
  quantityRequested: "1",
  description: "",
});

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || fallback);
  }
  return payload as T;
}

export default function NewMaterialRequestPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canManage = permissions.includes("material_requests.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);

  const [warehouseId, setWarehouseId] = useState("");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [budgetCode, setBudgetCode] = useState("");
  const [boqReference, setBoqReference] = useState("");
  const [specification, setSpecification] = useState("");
  const [note, setNote] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyLine()]);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [warehouseData, variantData] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }).then((res) =>
          readJson<Warehouse[]>(res, "Failed to load warehouses"),
        ),
        fetch("/api/product-variants", { cache: "no-store" }).then((res) =>
          readJson<Variant[]>(res, "Failed to load product variants"),
        ),
      ]);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setVariants(Array.isArray(variantData) ? variantData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load material request references");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) {
      void loadReferenceData();
    }
  }, [canManage]);

  const resetForm = () => {
    setWarehouseId("");
    setTitle("");
    setPurpose("");
    setBudgetCode("");
    setBoqReference("");
    setSpecification("");
    setNote("");
    setRequiredBy("");
    setItems([emptyLine()]);
    setAttachments([]);
  };

  const addAttachmentRows = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = Array.from(files)
      .slice(0, 20)
      .map((file) => ({ file, note: "" }));
    setAttachments((current) => [...current, ...next].slice(0, 20));
  };

  const updateAttachmentNote = (index: number, value: string) => {
    setAttachments((current) =>
      current.map((item, idx) => (idx === index ? { ...item, note: value } : item)),
    );
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, idx) => idx !== index));
  };

  const updateItem = (index: number, key: keyof DraftItem, value: string) => {
    setItems((current) =>
      current.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)),
    );
  };

  const createMaterialRequest = async () => {
    if (!warehouseId) {
      toast.error("Warehouse is required");
      return;
    }

    const payloadItems = items
      .map((item) => ({
        productVariantId: Number(item.productVariantId),
        quantityRequested: Number(item.quantityRequested),
        description: item.description.trim() || null,
      }))
      .filter(
        (item) =>
          Number.isInteger(item.productVariantId) &&
          item.productVariantId > 0 &&
          Number.isInteger(item.quantityRequested) &&
          item.quantityRequested > 0,
      );

    if (payloadItems.length === 0) {
      toast.error("At least one valid request line is required");
      return;
    }

    try {
      setSaving(true);
      const uploadedAttachments = [] as Array<{
        fileUrl: string;
        fileName: string;
        mimeType: string | null;
        fileSize: number | null;
        note: string | null;
      }>;

      for (const attachment of attachments) {
        const fileUrl = await uploadFile(attachment.file, MATERIAL_UPLOAD_ENDPOINT);
        uploadedAttachments.push({
          fileUrl,
          fileName: attachment.file.name,
          mimeType: attachment.file.type || null,
          fileSize: attachment.file.size,
          note: attachment.note.trim() || null,
        });
      }

      const response = await fetch("/api/scm/material-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: Number(warehouseId),
          title,
          purpose,
          budgetCode,
          boqReference,
          specification,
          note,
          requiredBy: requiredBy || null,
          items: payloadItems,
          attachments: uploadedAttachments,
        }),
      });

      const created = await readJson<MaterialRequest>(
        response,
        "Failed to create material request",
      );
      toast.success("Material request created");
      router.push(
        `/admin/scm/material-requests?search=${encodeURIComponent(created.requestNumber)}&focus=my-active`,
      );
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create material request");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You do not have permission to create material requests.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <ScmSectionHeader
        title="Create Material Request"
        description="Use the guided internal request flow to define warehouse, demand lines, support documents, and timing before workflow submission."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/scm/material-requests">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back To Register
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void loadReferenceData()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <ScmStatCard label="Warehouses" value={String(warehouses.length)} hint="Eligible store or warehouse locations" />
        <ScmStatCard label="Variants" value={String(variants.length)} hint="Item master available for request lines" />
        <ScmStatCard label="Attachments" value={String(attachments.length)} hint="Supporting files to include with the draft" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Planning Context</CardTitle>
          <CardDescription>
            Define where the request belongs, why it exists, and any planning or budget reference.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Warehouse</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                <option value="">Select warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Required By</Label>
              <Input
                type="datetime-local"
                value={requiredBy}
                onChange={(event) => setRequiredBy(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>Budget Code</Label>
              <Input
                value={budgetCode}
                onChange={(event) => setBudgetCode(event.target.value)}
                placeholder="BUDGET-2026-01"
              />
            </div>
            <div className="space-y-2">
              <Label>BOQ Reference</Label>
              <Input
                value={boqReference}
                onChange={(event) => setBoqReference(event.target.value)}
                placeholder="BOQ-RD-04"
              />
            </div>
            <div className="space-y-2">
              <Label>General Note</Label>
              <Input value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Specification</Label>
            <Textarea
              rows={3}
              value={specification}
              onChange={(event) => setSpecification(event.target.value)}
              placeholder="Technical specification, usage purpose, and quality constraints"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Request Lines</CardTitle>
          <CardDescription>
            Define the requested variants, quantity, and optional description per line.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Request Items</Label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setItems((current) => [...current, emptyLine()])}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Line
            </Button>
          </div>

          {items.map((item, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_1fr_2fr_auto]"
            >
              <div className="space-y-2">
                <Label>Variant</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={item.productVariantId}
                  onChange={(event) => updateItem(index, "productVariantId", event.target.value)}
                >
                  <option value="">Select variant</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.product?.name || "Variant"} ({variant.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantityRequested}
                  onChange={(event) => updateItem(index, "quantityRequested", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={item.description}
                  onChange={(event) => updateItem(index, "description", event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) =>
                      current.length === 1
                        ? current
                        : current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Supporting Documents</CardTitle>
          <CardDescription>
            Attach BOQ, specification, scope note, or any supporting evidence before saving the draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Supporting Documents</Label>
            <div className="text-xs text-muted-foreground">Max 20 files</div>
          </div>
          <Input type="file" multiple onChange={(event) => addAttachmentRows(event.target.files)} />

          {attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((attachment, index) => (
                <div
                  key={`${attachment.file.name}-${index}`}
                  className="grid gap-2 rounded-md border p-2 md:grid-cols-[2fr_3fr_auto]"
                >
                  <div className="text-sm text-muted-foreground">{attachment.file.name}</div>
                  <Input
                    placeholder="Attachment note (optional)"
                    value={attachment.note}
                    onChange={(event) => updateAttachmentNote(index, event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeAttachment(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No attachments added yet. You can still create the request without files.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 4: Save Draft</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            After creation, the request will appear in the register and can then move through supervisor,
            project manager, and administration workflow.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetForm} disabled={saving}>
              Clear
            </Button>
            <Button variant="outline" onClick={() => router.push("/admin/scm/material-requests")}>
              Cancel
            </Button>
            <Button onClick={() => void createMaterialRequest()} disabled={saving || loading}>
              {saving ? "Saving..." : "Create Draft"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
