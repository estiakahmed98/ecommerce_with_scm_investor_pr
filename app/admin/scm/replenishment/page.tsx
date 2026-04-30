"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type ProductVariant = {
  id: number;
  sku: string;
  lowStockThreshold: number;
  product: {
    id: number;
    name: string;
  };
};

type Rule = {
  id: number;
  warehouseId: number;
  productVariantId: number;
  strategy: "MIN_MAX" | "REORDER_POINT";
  reorderPoint: number;
  targetStockLevel: number;
  safetyStock: number;
  minOrderQty: number;
  orderMultiple: number;
  leadTimeDays: number | null;
  isActive: boolean;
  note: string | null;
  warehouse: Warehouse;
  productVariant: ProductVariant;
};

type Suggestion = {
  ruleId: number;
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  productVariantId: number;
  productId: number;
  productName: string;
  sku: string;
  strategy: "MIN_MAX" | "REORDER_POINT";
  availableQty: number;
  onHandQty: number;
  reservedQty: number;
  reorderPoint: number;
  targetStockLevel: number;
  safetyStock: number;
  shortageQty: number;
  transferQty: number;
  purchaseQty: number;
  recommendedAction: "NONE" | "PURCHASE" | "TRANSFER" | "HYBRID";
  leadTimeDays: number | null;
  minOrderQty: number;
  orderMultiple: number;
  triggered: boolean;
  sourceWarehouse: {
    id: number;
    name: string;
    code: string;
    transferableQty: number;
  } | null;
};

const defaultForm = {
  ruleId: "",
  warehouseId: "",
  productVariantId: "",
  strategy: "MIN_MAX",
  reorderPoint: "10",
  targetStockLevel: "30",
  safetyStock: "0",
  minOrderQty: "1",
  orderMultiple: "1",
  leadTimeDays: "",
  isActive: true,
  note: "",
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || fallback);
  }
  return payload as T;
}

function formatDate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString();
}

export default function ReplenishmentPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canRead = permissions.some((permission) =>
    ["replenishment.read", "replenishment.manage"].includes(permission),
  );
  const canManage = permissions.includes("replenishment.manage");
  const canCreateRequisition =
    permissions.includes("replenishment.manage") &&
    permissions.includes("purchase_requisitions.manage");
  const canCreateTransfer =
    permissions.includes("replenishment.manage") &&
    permissions.includes("warehouse_transfers.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleForm, setRuleForm] = useState(defaultForm);
  const [warehouseFilter, setWarehouseFilter] = useState(searchParams.get("warehouseId") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [neededBy, setNeededBy] = useState("");
  const [requisitionNote, setRequisitionNote] = useState("");
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const loadData = async (warehouseId?: string) => {
    setLoading(true);
    try {
      const suffix =
        warehouseId && Number(warehouseId) > 0 ? `?warehouseId=${warehouseId}` : "";
      const [warehouseData, variantData, ruleData, suggestionData] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }).then((response) =>
          readJson<Warehouse[]>(response, "Failed to load warehouses"),
        ),
        fetch("/api/product-variants", { cache: "no-store" }).then((response) =>
          readJson<ProductVariant[]>(response, "Failed to load variants"),
        ),
        fetch(`/api/scm/replenishment/rules?includeInactive=1${suffix ? `&warehouseId=${warehouseId}` : ""}`, {
          cache: "no-store",
        }).then((response) =>
          readJson<Rule[]>(response, "Failed to load replenishment rules"),
        ),
        fetch(`/api/scm/replenishment/suggestions${suffix}`, { cache: "no-store" }).then((response) =>
          readJson<Suggestion[]>(response, "Failed to load replenishment suggestions"),
        ),
      ]);

      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setVariants(Array.isArray(variantData) ? variantData : []);
      setRules(Array.isArray(ruleData) ? ruleData : []);
      setSuggestions(Array.isArray(suggestionData) ? suggestionData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load replenishment planning data");
      setRules([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadData(warehouseFilter);
    }
  }, [canRead, warehouseFilter]);

  useEffect(() => {
    setWarehouseFilter(searchParams.get("warehouseId") || "");
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);

  const selectedWarehouseId = Number(ruleForm.warehouseId);
  const selectedVariant = useMemo(
    () =>
      variants.find((variant) => variant.id === Number(ruleForm.productVariantId)) ?? null,
    [ruleForm.productVariantId, variants],
  );

  useEffect(() => {
    if (selectedVariant && !ruleForm.ruleId) {
      setRuleForm((current) => ({
        ...current,
        reorderPoint:
          current.reorderPoint === "10"
            ? String(selectedVariant.lowStockThreshold ?? 10)
            : current.reorderPoint,
      }));
    }
  }, [selectedVariant, ruleForm.ruleId]);

  const visibleRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rules.filter((rule) => {
      if (warehouseFilter && rule.warehouseId !== Number(warehouseFilter)) return false;
      if (!query) return true;
      return (
        rule.productVariant.product.name.toLowerCase().includes(query) ||
        rule.productVariant.sku.toLowerCase().includes(query) ||
        rule.warehouse.name.toLowerCase().includes(query)
      );
    });
  }, [rules, search, warehouseFilter]);

  const visibleSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return suggestions.filter((suggestion) => {
      if (warehouseFilter && suggestion.warehouseId !== Number(warehouseFilter)) return false;
      if (!query) return true;
      return (
        suggestion.productName.toLowerCase().includes(query) ||
        suggestion.sku.toLowerCase().includes(query) ||
        suggestion.warehouseName.toLowerCase().includes(query)
      );
    });
  }, [search, suggestions, warehouseFilter]);

  const purchasableSuggestions = visibleSuggestions.filter(
    (suggestion) => suggestion.purchaseQty > 0,
  );
  const transferableSuggestions = visibleSuggestions.filter(
    (suggestion) => suggestion.transferQty > 0,
  );

  const saveRule = async () => {
    if (!ruleForm.warehouseId || !ruleForm.productVariantId) {
      toast.error("Warehouse and variant are required");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/scm/replenishment/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId: ruleForm.ruleId || null,
          warehouseId: Number(ruleForm.warehouseId),
          productVariantId: Number(ruleForm.productVariantId),
          strategy: ruleForm.strategy,
          reorderPoint: Number(ruleForm.reorderPoint),
          targetStockLevel: Number(ruleForm.targetStockLevel),
          safetyStock: Number(ruleForm.safetyStock),
          minOrderQty: Number(ruleForm.minOrderQty),
          orderMultiple: Number(ruleForm.orderMultiple),
          leadTimeDays: ruleForm.leadTimeDays ? Number(ruleForm.leadTimeDays) : null,
          isActive: ruleForm.isActive,
          note: ruleForm.note,
        }),
      });

      await readJson(response, "Failed to save replenishment rule");
      toast.success("Replenishment rule saved");
      setRuleForm(defaultForm);
      await loadData(warehouseFilter);
    } catch (error: any) {
      toast.error(error?.message || "Failed to save replenishment rule");
    } finally {
      setSaving(false);
    }
  };

  const editRule = (rule: Rule) => {
    setRuleForm({
      ruleId: String(rule.id),
      warehouseId: String(rule.warehouseId),
      productVariantId: String(rule.productVariantId),
      strategy: rule.strategy,
      reorderPoint: String(rule.reorderPoint),
      targetStockLevel: String(rule.targetStockLevel),
      safetyStock: String(rule.safetyStock),
      minOrderQty: String(rule.minOrderQty),
      orderMultiple: String(rule.orderMultiple),
      leadTimeDays: rule.leadTimeDays ? String(rule.leadTimeDays) : "",
      isActive: rule.isActive,
      note: rule.note || "",
    });
  };

  const createRequisition = async () => {
    const selectedSuggestions = purchasableSuggestions.filter((suggestion) =>
      selectedRuleIds.includes(suggestion.ruleId),
    );
    if (selectedSuggestions.length === 0) {
      toast.error("Select at least one purchase suggestion");
      return;
    }

    const distinctWarehouses = [...new Set(selectedSuggestions.map((item) => item.warehouseId))];
    if (distinctWarehouses.length !== 1) {
      toast.error("Selected suggestions must belong to the same warehouse");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/scm/replenishment/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: distinctWarehouses[0],
          neededBy: neededBy || null,
          note: requisitionNote,
          items: selectedSuggestions.map((suggestion) => ({
            ruleId: suggestion.ruleId,
            quantityRequested: suggestion.purchaseQty,
          })),
        }),
      });

      const requisition = await readJson<{ requisitionNumber: string }>(
        response,
        "Failed to create replenishment requisition",
      );
      toast.success(
        `Purchase requisition ${requisition.requisitionNumber} created from planning`,
      );
      setSelectedRuleIds([]);
      setNeededBy("");
      setRequisitionNote("");
      router.push(
        `/admin/scm/purchase-requisitions?search=${encodeURIComponent(requisition.requisitionNumber)}`,
      );
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create replenishment requisition");
    } finally {
      setSaving(false);
    }
  };

  const createTransferDraft = async (suggestion: Suggestion) => {
    if (!suggestion.sourceWarehouse || suggestion.transferQty <= 0) {
      toast.error("This suggestion does not have a transferable quantity");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/scm/replenishment/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_transfer",
          warehouseId: suggestion.warehouseId,
          neededBy: neededBy || null,
          note:
            requisitionNote ||
            `Generated for ${suggestion.productName} (${suggestion.sku}) from replenishment planning.`,
          items: [
            {
              ruleId: suggestion.ruleId,
              quantityRequested: suggestion.transferQty,
            },
          ],
        }),
      });

      const transfer = await readJson<{ transferNumber: string }>(
        response,
        "Failed to create transfer draft",
      );
      toast.success(`Transfer draft ${transfer.transferNumber} created from planning`);
      router.push(
        `/admin/scm/warehouse-transfers?search=${encodeURIComponent(transfer.transferNumber)}`,
      );
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create transfer draft");
    } finally {
      setSaving(false);
    }
  };

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
            <CardDescription>
              You do not have permission to access replenishment planning.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Replenishment Planning</h1>
          <p className="text-sm text-muted-foreground">
            Define warehouse reorder rules, review shortage signals, and convert purchase needs into requisitions.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadData(warehouseFilter)} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Rules" value={String(rules.length)} hint="Configured replenishment logic" />
        <ScmStatCard label="Triggered" value={String(visibleSuggestions.length)} hint="Current shortage or planning signals" />
        <ScmStatCard label="Purchase Signals" value={String(purchasableSuggestions.length)} hint="Can convert into requisitions" />
        <ScmStatCard label="Transfer Signals" value={String(transferableSuggestions.length)} hint="Can convert into transfer drafts" />
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{ruleForm.ruleId ? "Edit Rule" : "Create Rule"}</CardTitle>
            <CardDescription>
              Store rule-based planning thresholds by warehouse and variant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Warehouse</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={ruleForm.warehouseId}
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, warehouseId: event.target.value }))
                  }
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
                <Label>Variant</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={ruleForm.productVariantId}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      productVariantId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select variant</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.product.name} ({variant.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Strategy</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={ruleForm.strategy}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      strategy: event.target.value as "MIN_MAX" | "REORDER_POINT",
                    }))
                  }
                >
                  <option value="MIN_MAX">MIN_MAX</option>
                  <option value="REORDER_POINT">REORDER_POINT</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Lead Time (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={ruleForm.leadTimeDays}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      leadTimeDays: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label>Reorder Point</Label>
                <Input
                  type="number"
                  min={0}
                  value={ruleForm.reorderPoint}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      reorderPoint: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Target Stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={ruleForm.targetStockLevel}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      targetStockLevel: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Safety Stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={ruleForm.safetyStock}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      safetyStock: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Min Order Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.minOrderQty}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      minOrderQty: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Order Multiple</Label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.orderMultiple}
                  onChange={(event) =>
                    setRuleForm((current) => ({
                      ...current,
                      orderMultiple: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                rows={3}
                value={ruleForm.note}
                onChange={(event) =>
                  setRuleForm((current) => ({ ...current, note: event.target.value }))
                }
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ruleForm.isActive}
                onChange={(event) =>
                  setRuleForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
              />
              Rule Active
            </label>

            <div className="flex gap-2">
              <Button onClick={() => void saveRule()} disabled={saving}>
                {saving ? "Saving..." : ruleForm.ruleId ? "Update Rule" : "Save Rule"}
              </Button>
              {ruleForm.ruleId ? (
                <Button variant="outline" onClick={() => setRuleForm(defaultForm)}>
                  Cancel Edit
                </Button>
              ) : null}
            </div>

            {selectedVariant ? (
              <p className="text-xs text-muted-foreground">
                Variant default low-stock threshold: {selectedVariant.lowStockThreshold}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Rules & Signals</CardTitle>
          <CardDescription>
            Review active replenishment signals and compare transfer vs purchase guidance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={warehouseFilter}
              onChange={(event) => {
                setWarehouseFilter(event.target.value);
                setSelectedRuleIds([]);
              }}
            >
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
            <Input
              placeholder="Search warehouse, product, or SKU..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="outline" onClick={() => void loadData(warehouseFilter)} disabled={loading}>
              Refresh
            </Button>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configured Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>{rule.warehouse.code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{rule.productVariant.product.name}</div>
                          <div className="text-xs text-muted-foreground">{rule.productVariant.sku}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            RP {rule.reorderPoint} / Target {rule.targetStockLevel}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            MOQ {rule.minOrderQty} / Multiple {rule.orderMultiple}
                          </div>
                        </TableCell>
                        <TableCell>{rule.isActive ? "ACTIVE" : "INACTIVE"}</TableCell>
                        <TableCell>
                          {canManage ? (
                            <Button size="sm" variant="outline" onClick={() => editRule(rule)}>
                              Edit
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && visibleRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          No replenishment rules found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Planning Suggestions</CardTitle>
                <CardDescription>
                  Triggered rules below reorder point appear here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canCreateRequisition ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
                    <Input
                      type="date"
                      value={neededBy}
                      onChange={(event) => setNeededBy(event.target.value)}
                    />
                    <Input
                      placeholder="Requisition note"
                      value={requisitionNote}
                      onChange={(event) => setRequisitionNote(event.target.value)}
                    />
                    <Button onClick={() => void createRequisition()} disabled={saving || selectedRuleIds.length === 0}>
                      Create Requisition
                    </Button>
                  </div>
                ) : null}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Select</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Signal</TableHead>
                      <TableHead>Recommendation</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSuggestions.map((suggestion) => {
                      const selectable = suggestion.purchaseQty > 0;
                      const selected = selectedRuleIds.includes(suggestion.ruleId);
                      return (
                        <TableRow key={suggestion.ruleId}>
                          <TableCell>
                            <input
                              type="checkbox"
                              disabled={!selectable}
                              checked={selected}
                              onChange={(event) =>
                                setSelectedRuleIds((current) =>
                                  event.target.checked
                                    ? [...current, suggestion.ruleId]
                                    : current.filter((value) => value !== suggestion.ruleId),
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{suggestion.productName}</div>
                            <div className="text-xs text-muted-foreground">
                              {suggestion.sku} | {suggestion.warehouseCode}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              Available {suggestion.availableQty}, RP {suggestion.reorderPoint}, Target {suggestion.targetStockLevel}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Shortage {suggestion.shortageQty} | Reserved {suggestion.reservedQty}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{suggestion.recommendedAction}</div>
                            <div className="text-xs text-muted-foreground">
                              Transfer {suggestion.transferQty} | Purchase {suggestion.purchaseQty}
                            </div>
                            {suggestion.sourceWarehouse ? (
                              <div className="text-xs text-muted-foreground">
                                Source: {suggestion.sourceWarehouse.code} ({suggestion.sourceWarehouse.transferableQty})
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {suggestion.leadTimeDays !== null ? `${suggestion.leadTimeDays}d` : "N/A"}
                          </TableCell>
                          <TableCell>
                            {canCreateTransfer &&
                            suggestion.sourceWarehouse &&
                            suggestion.transferQty > 0 ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={saving}
                                onClick={() => void createTransferDraft(suggestion)}
                              >
                                Create Transfer Draft
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!loading && visibleSuggestions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                          No triggered replenishment suggestions.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
