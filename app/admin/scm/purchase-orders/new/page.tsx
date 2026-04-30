"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";

type Supplier = { id: number; name: string; code: string; currency: string };
type Warehouse = { id: number; name: string; code: string };
type Variant = { id: number; sku: string; productId: number; stock: number };
type PurchaseOrderTermsTemplate = { id: number; code: string; name: string; body: string; isDefault: boolean; isActive: boolean };
type PurchaseOrderDraftItem = { productVariantId: string; quantityOrdered: string; unitCost: string; description: string };

const emptyLine = (): PurchaseOrderDraftItem => ({
  productVariantId: "",
  quantityOrdered: "1",
  unitCost: "",
  description: "",
});

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [termsTemplates, setTermsTemplates] = useState<PurchaseOrderTermsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [termsTemplateId, setTermsTemplateId] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [items, setItems] = useState<PurchaseOrderDraftItem[]>([emptyLine()]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [warehousesRes, variantsRes, suppliersRes, templatesRes] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }),
        fetch("/api/product-variants", { cache: "no-store" }),
        fetch("/api/scm/suppliers", { cache: "no-store" }),
        fetch("/api/scm/purchase-order-terms-templates", { cache: "no-store" }),
      ]);
      const [warehouseData, variantData, supplierData, templateData] = await Promise.all([
        readJson<Warehouse[]>(warehousesRes, "Failed to load warehouses"),
        readJson<Variant[]>(variantsRes, "Failed to load variants"),
        readJson<Supplier[]>(suppliersRes, "Failed to load suppliers"),
        readJson<PurchaseOrderTermsTemplate[]>(templatesRes, "Failed to load PO terms templates"),
      ]);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setVariants(Array.isArray(variantData) ? variantData : []);
      setSuppliers(Array.isArray(supplierData) ? supplierData : []);
      setTermsTemplates(Array.isArray(templateData) ? templateData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load purchase order setup data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const defaultTemplate = useMemo(
    () => termsTemplates.find((template) => template.isDefault) ?? termsTemplates[0] ?? null,
    [termsTemplates],
  );

  useEffect(() => {
    if (!termsTemplateId && defaultTemplate) {
      setTermsTemplateId(String(defaultTemplate.id));
      setTermsAndConditions(defaultTemplate.body);
    }
  }, [defaultTemplate, termsTemplateId]);

  const applyTemplateSelection = (nextTemplateId: string) => {
    setTermsTemplateId(nextTemplateId);
    const selectedTemplate = termsTemplates.find((template) => String(template.id) === nextTemplateId);
    if (selectedTemplate) {
      setTermsAndConditions(selectedTemplate.body);
      return;
    }
    if (!nextTemplateId) {
      setTermsAndConditions("");
    }
  };

  const estimatedTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const quantity = Number(item.quantityOrdered);
      const unitCost = Number(item.unitCost);
      if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return sum;
      return sum + quantity * unitCost;
    }, 0);
  }, [items]);

  const createPurchaseOrder = async () => {
    if (!supplierId || !warehouseId) {
      toast.error("Supplier and warehouse are required");
      return;
    }
    try {
      setSaving(true);
      const response = await fetch("/api/scm/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          warehouseId: Number(warehouseId),
          expectedAt: expectedAt || null,
          notes,
          termsTemplateId: termsTemplateId ? Number(termsTemplateId) : null,
          termsAndConditions,
          items: items.map((item) => ({
            productVariantId: Number(item.productVariantId),
            quantityOrdered: Number(item.quantityOrdered),
            unitCost: Number(item.unitCost),
            description: item.description,
          })),
        }),
      });
      const created = await readJson<{ id: number }>(response, "Failed to create purchase order");
      toast.success("Purchase order created");
      router.push(`/admin/scm/purchase-orders/${created.id}`);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/scm/purchase-orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back To Register
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">New Purchase Order</h1>
            <p className="text-sm text-muted-foreground">
              Build the commercial order in sequence: counterparty, line items, terms, then save the draft.
            </p>
          </div>
        </div>
        <Button onClick={() => void createPurchaseOrder()} disabled={saving || loading}>
          {saving ? "Saving..." : "Create Draft"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Supplier" value={suppliers.find((row) => row.id === Number(supplierId))?.name || "Not selected"} hint="Legal supplier on the order" />
        <ScmStatCard label="Warehouse" value={warehouses.find((row) => row.id === Number(warehouseId))?.name || "Not selected"} hint="Receiving warehouse" />
        <ScmStatCard label="Lines" value={String(items.length)} hint="Draft commercial lines" />
        <ScmStatCard label="Estimated Total" value={estimatedTotal.toFixed(2)} hint={suppliers.find((row) => row.id === Number(supplierId))?.currency || "BDT"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Counterparty and Delivery</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Supplier</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name} ({supplier.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Warehouse</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                  <option value="">Select warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Expected Delivery</Label>
                <Input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Commercial Lines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Capture exact variant, quantity, and unit cost per line.</p>
                <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyLine()])}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Line
                </Button>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_1fr_1fr_2fr_auto]">
                  <div>
                    <Label>Variant</Label>
                    <select className="w-full rounded-md border bg-background px-3 py-2" value={item.productVariantId} onChange={(event) => setItems((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, productVariantId: event.target.value } : row))}>
                      <option value="">Select variant</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>{variant.sku}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Qty</Label>
                    <Input type="number" min="1" value={item.quantityOrdered} onChange={(event) => setItems((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, quantityOrdered: event.target.value } : row))} />
                  </div>
                  <div>
                    <Label>Unit Cost</Label>
                    <Input type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => setItems((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, unitCost: event.target.value } : row))} />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={item.description} onChange={(event) => setItems((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} />
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" size="icon" onClick={() => setItems((prev) => prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index))} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Terms and Commercial Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Terms Template</Label>
                  <select className="w-full rounded-md border bg-background px-3 py-2" value={termsTemplateId} onChange={(event) => applyTemplateSelection(event.target.value)}>
                    <option value="">No template</option>
                    {termsTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}{template.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
                </div>
              </div>
              <div>
                <Label>Terms and Conditions</Label>
                <Textarea value={termsAndConditions} onChange={(event) => setTermsAndConditions(event.target.value)} rows={7} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className={supplierId ? "text-foreground" : "text-muted-foreground"}>1. Supplier selected</div>
              <div className={warehouseId ? "text-foreground" : "text-muted-foreground"}>2. Warehouse selected</div>
              <div className={items.some((item) => item.productVariantId && item.unitCost && item.quantityOrdered) ? "text-foreground" : "text-muted-foreground"}>3. At least one priced line added</div>
              <div className={termsAndConditions ? "text-foreground" : "text-muted-foreground"}>4. Terms captured</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Draft Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Expected Delivery</div>
                <div className="mt-1 font-medium">{expectedAt || "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Line Count</div>
                <div className="mt-1 font-medium">{items.length}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Terms Template</div>
                <div className="mt-1 font-medium">{termsTemplates.find((template) => String(template.id) === termsTemplateId)?.name || "Custom / None"}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
