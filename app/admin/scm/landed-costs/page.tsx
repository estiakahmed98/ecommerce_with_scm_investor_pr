"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

type PurchaseOrderOption = {
  id: number;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedAt: string | null;
  currency: string;
  supplier: {
    id: number;
    name: string;
    code: string;
  };
  warehouse: {
    id: number;
    name: string;
    code: string;
  };
};

type SelectedPurchaseOrder = {
  id: number;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedAt: string | null;
  currency: string;
  supplier: {
    id: number;
    name: string;
    code: string;
  };
  warehouse: {
    id: number;
    name: string;
    code: string;
  };
  locked: boolean;
  lockReason: string | null;
  totals: {
    baseSubtotal: string;
    landedTotal: string;
    effectiveSubtotal: string;
  };
  landedCosts: Array<{
    id: number;
    component: string;
    amount: string;
    currency: string;
    note: string | null;
    incurredAt: string;
    createdAt: string;
    createdBy: {
      id: string;
      name: string | null;
      email: string | null;
    } | null;
  }>;
  allocationLines: Array<{
    purchaseOrderItemId: number;
    variantId: number | null;
    sku: string;
    productName: string;
    quantityOrdered: number;
    baseUnitCost: string;
    landedPerUnit: string;
    effectiveUnitCost: string;
    baseLineTotal: string;
    landedAllocationTotal: string;
    effectiveLineTotal: string;
  }>;
};

type WorkspaceResponse = {
  purchaseOrders: PurchaseOrderOption[];
  selectedPurchaseOrder: SelectedPurchaseOrder | null;
};

const COMPONENT_OPTIONS = [
  "FREIGHT",
  "CUSTOMS",
  "HANDLING",
  "INSURANCE",
  "CLEARING",
  "OTHER",
] as const;

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

function formatMoney(value: string | number) {
  return Number(value || 0).toFixed(2);
}

function formatComponent(component: string) {
  return component
    .split("_")
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(" ");
}

export default function LandedCostsPage() {
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canManage = permissions.includes("landed_costs.manage");

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<number | null>(
    null,
  );
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] =
    useState<SelectedPurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [component, setComponent] = useState<(typeof COMPONENT_OPTIONS)[number]>(
    "FREIGHT",
  );
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState("");
  const [note, setNote] = useState("");

  const loadWorkspace = async (purchaseOrderId?: number | null) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (purchaseOrderId && purchaseOrderId > 0) {
        params.set("purchaseOrderId", String(purchaseOrderId));
      }
      const response = await fetch(
        `/api/scm/landed-costs${params.toString() ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const data = await readJson<WorkspaceResponse>(
        response,
        "Failed to load landed cost workspace",
      );
      setPurchaseOrders(Array.isArray(data.purchaseOrders) ? data.purchaseOrders : []);
      setSelectedPurchaseOrder(data.selectedPurchaseOrder || null);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load landed costs");
      setSelectedPurchaseOrder(null);
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace(selectedPurchaseOrderId);
  }, [selectedPurchaseOrderId]);

  useEffect(() => {
    if (selectedPurchaseOrderId !== null) return;
    if (purchaseOrders.length === 0) return;
    setSelectedPurchaseOrderId(purchaseOrders[0].id);
  }, [purchaseOrders, selectedPurchaseOrderId]);

  const canEditCurrent = useMemo(() => {
    if (!canManage) return false;
    if (!selectedPurchaseOrder) return false;
    return !selectedPurchaseOrder.locked;
  }, [canManage, selectedPurchaseOrder]);

  const clearForm = () => {
    setComponent("FREIGHT");
    setAmount("");
    setIncurredAt("");
    setNote("");
  };

  const createLandedCost = async () => {
    if (!selectedPurchaseOrderId) {
      toast.error("Select a purchase order first.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Amount must be greater than 0.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/scm/landed-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: selectedPurchaseOrderId,
          component,
          amount: Number(amount),
          incurredAt: incurredAt || null,
          note,
        }),
      });
      await readJson(response, "Failed to create landed cost");
      toast.success("Landed cost added");
      clearForm();
      await loadWorkspace(selectedPurchaseOrderId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create landed cost");
    } finally {
      setSaving(false);
    }
  };

  const deleteLandedCost = async (landedCostId: number) => {
    try {
      setSaving(true);
      const response = await fetch(`/api/scm/landed-costs/${landedCostId}`, {
        method: "DELETE",
      });
      await readJson(response, "Failed to delete landed cost");
      toast.success("Landed cost removed");
      await loadWorkspace(selectedPurchaseOrderId);
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete landed cost");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Landed Cost Allocation</h1>
          <p className="text-sm text-muted-foreground">
            Capture freight/customs/handling and allocate cost across PO line items before
            stock receipt.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadWorkspace(selectedPurchaseOrderId)}
          disabled={loading}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Order Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Purchase Order</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2"
                value={selectedPurchaseOrderId ?? ""}
                onChange={(event) =>
                  setSelectedPurchaseOrderId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">Select purchase order</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} - {po.supplier.name} - {po.warehouse.code} ({po.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!selectedPurchaseOrder ? (
            <p className="text-sm text-muted-foreground">
              {loading
                ? "Loading workspace..."
                : "Select a purchase order to manage landed costs."}
            </p>
          ) : (
            <div className="space-y-3 rounded-lg border p-4 text-sm">
              <div className="font-medium">
                {selectedPurchaseOrder.poNumber} - {selectedPurchaseOrder.supplier.name} -{" "}
                {selectedPurchaseOrder.warehouse.name}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  Base subtotal:{" "}
                  <span className="font-medium">
                    {formatMoney(selectedPurchaseOrder.totals.baseSubtotal)}{" "}
                    {selectedPurchaseOrder.currency}
                  </span>
                </div>
                <div>
                  Landed cost total:{" "}
                  <span className="font-medium">
                    {formatMoney(selectedPurchaseOrder.totals.landedTotal)}{" "}
                    {selectedPurchaseOrder.currency}
                  </span>
                </div>
                <div>
                  Effective subtotal:{" "}
                  <span className="font-medium">
                    {formatMoney(selectedPurchaseOrder.totals.effectiveSubtotal)}{" "}
                    {selectedPurchaseOrder.currency}
                  </span>
                </div>
              </div>
              {selectedPurchaseOrder.lockReason ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-300">
                  {selectedPurchaseOrder.lockReason}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedPurchaseOrder ? (
        <Card>
          <CardHeader>
            <CardTitle>Add Landed Cost Component</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <Label>Component</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={component}
                  onChange={(event) =>
                    setComponent(event.target.value as (typeof COMPONENT_OPTIONS)[number])
                  }
                  disabled={!canEditCurrent || saving}
                >
                  {COMPONENT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatComponent(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Amount ({selectedPurchaseOrder.currency})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={!canEditCurrent || saving}
                />
              </div>
              <div>
                <Label>Incurred Date</Label>
                <Input
                  type="datetime-local"
                  value={incurredAt}
                  onChange={(event) => setIncurredAt(event.target.value)}
                  disabled={!canEditCurrent || saving}
                />
              </div>
              <div>
                <Label>Note</Label>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={1}
                  disabled={!canEditCurrent || saving}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => void createLandedCost()}
                disabled={!canEditCurrent || saving}
              >
                Add Component
              </Button>
              <Button
                variant="outline"
                onClick={clearForm}
                disabled={!canEditCurrent || saving}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selectedPurchaseOrder ? (
        <Card>
          <CardHeader>
            <CardTitle>Component Register</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPurchaseOrder.landedCosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No landed cost components yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Incurred</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPurchaseOrder.landedCosts.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatComponent(row.component)}</TableCell>
                      <TableCell>
                        {formatMoney(row.amount)} {row.currency}
                      </TableCell>
                      <TableCell>
                        {new Date(row.incurredAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{row.note || "N/A"}</TableCell>
                      <TableCell>{row.createdBy?.name || row.createdBy?.email || "N/A"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void deleteLandedCost(row.id)}
                          disabled={!canEditCurrent || saving}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {selectedPurchaseOrder ? (
        <Card>
          <CardHeader>
            <CardTitle>Allocation Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPurchaseOrder.allocationLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No PO line item found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Base Unit</TableHead>
                    <TableHead>Landed / Unit</TableHead>
                    <TableHead>Effective Unit</TableHead>
                    <TableHead>Base Line</TableHead>
                    <TableHead>Landed Allocation</TableHead>
                    <TableHead>Effective Line</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPurchaseOrder.allocationLines.map((line) => (
                    <TableRow key={line.purchaseOrderItemId}>
                      <TableCell>
                        <div className="font-medium">{line.productName}</div>
                        <div className="text-xs text-muted-foreground">{line.sku}</div>
                      </TableCell>
                      <TableCell>{line.quantityOrdered}</TableCell>
                      <TableCell>{formatMoney(line.baseUnitCost)}</TableCell>
                      <TableCell>{formatMoney(line.landedPerUnit)}</TableCell>
                      <TableCell>{formatMoney(line.effectiveUnitCost)}</TableCell>
                      <TableCell>{formatMoney(line.baseLineTotal)}</TableCell>
                      <TableCell>{formatMoney(line.landedAllocationTotal)}</TableCell>
                      <TableCell>{formatMoney(line.effectiveLineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
