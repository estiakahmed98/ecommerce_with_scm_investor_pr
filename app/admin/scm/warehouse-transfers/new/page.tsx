"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
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

type ProductVariant = {
  id: number;
  sku: string;
  product?: {
    name: string;
  };
};

type WarehouseTransfer = {
  id: number;
  transferNumber: string;
};

type DraftItem = {
  productVariantId: string;
  quantityRequested: string;
  description: string;
};

const emptyLine = (): DraftItem => ({
  productVariantId: "",
  quantityRequested: "",
  description: "",
});

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || fallback);
  }
  return payload as T;
}

export default function NewWarehouseTransferPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canManage = permissions.includes("warehouse_transfers.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyLine()]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  const loadReferenceData = async () => {
    try {
      setLoading(true);
      const [warehouseData, variantData] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }).then((response) =>
          readJson<Warehouse[]>(response, "Failed to load warehouses"),
        ),
        fetch("/api/product-variants", { cache: "no-store" }).then((response) =>
          readJson<ProductVariant[]>(response, "Failed to load product variants"),
        ),
      ]);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setVariants(Array.isArray(variantData) ? variantData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load transfer references");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) {
      void loadReferenceData();
    }
  }, [canManage]);

  const updateItem = (index: number, key: keyof DraftItem, value: string) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const summary = useMemo(
    () => ({
      warehouses: warehouses.length,
      variants: variants.length,
      lines: items.length,
    }),
    [items.length, variants.length, warehouses.length],
  );

  const createTransfer = async () => {
    if (!sourceWarehouseId || !destinationWarehouseId) {
      toast.error("Source and destination warehouses are required");
      return;
    }
    if (sourceWarehouseId === destinationWarehouseId) {
      toast.error("Source and destination warehouses must be different");
      return;
    }

    const payloadItems = items
      .map((item) => ({
        productVariantId: Number(item.productVariantId),
        quantityRequested: Number(item.quantityRequested),
        description: item.description.trim(),
      }))
      .filter(
        (item) =>
          Number.isInteger(item.productVariantId) &&
          item.productVariantId > 0 &&
          Number.isInteger(item.quantityRequested) &&
          item.quantityRequested > 0,
      );

    if (payloadItems.length === 0) {
      toast.error("At least one valid transfer line is required");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/scm/warehouse-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceWarehouseId: Number(sourceWarehouseId),
          destinationWarehouseId: Number(destinationWarehouseId),
          requiredBy: requiredBy || null,
          note,
          items: payloadItems,
        }),
      });
      const created = await readJson<WarehouseTransfer>(
        response,
        "Failed to create warehouse transfer",
      );
      toast.success("Warehouse transfer created");
      router.push(`/admin/scm/warehouse-transfers?search=${encodeURIComponent(created.transferNumber)}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create warehouse transfer");
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
            You do not have permission to create warehouse transfers.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <ScmSectionHeader
        title="Create Warehouse Transfer"
        description="Use the guided inter-warehouse workflow to define route, requested timing, and transfer lines before approval."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/scm/warehouse-transfers">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back To Queue
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
        <ScmStatCard label="Warehouses" value={String(summary.warehouses)} hint="Available route endpoints" />
        <ScmStatCard label="Variants" value={String(summary.variants)} hint="Transferable item master" />
        <ScmStatCard label="Transfer Lines" value={String(summary.lines)} hint="Current transfer draft lines" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Define Route</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label>Source Warehouse</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={sourceWarehouseId}
              onChange={(event) => setSourceWarehouseId(event.target.value)}
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
            <Label>Destination Warehouse</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={destinationWarehouseId}
              onChange={(event) => setDestinationWarehouseId(event.target.value)}
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
            <Label>Required By</Label>
            <Input
              type="datetime-local"
              value={requiredBy}
              onChange={(event) => setRequiredBy(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Transfer Lines</CardTitle>
          <CardDescription>
            Add the exact variants and requested quantities that should move between warehouses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Transfer Items</Label>
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
            <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[2fr_1fr_2fr_auto]">
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
                      {variant.product?.name ?? "Variant"} ({variant.sku})
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
                  variant="ghost"
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Save Draft</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            After creation, the transfer enters the warehouse queue and can then move through approval, dispatch, and receipt.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin/scm/warehouse-transfers")}>
              Cancel
            </Button>
            <Button onClick={() => void createTransfer()} disabled={saving || loading}>
              {saving ? "Saving..." : "Create Transfer"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
