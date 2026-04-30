"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Warehouse = { id: number; name: string; code: string };
type Variant = { id: number; sku: string; product?: { id: number; name: string } };

type AlertRow = {
  id: number;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  stockOnHand: number;
  threshold: number;
  suggestedQty: number;
  note: string | null;
  createdAt: string;
  warehouse: Warehouse;
  productVariant: {
    id: number;
    sku: string;
    product: { id: number; name: string };
  };
  createdBy?: { id: string; name: string | null; email: string | null } | null;
};

async function readJson<T>(res: Response, errorMessage: string) {
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || errorMessage);
  }
  return (await res.json()) as T;
}

export default function ReorderAlertsPage() {
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canRead = permissions.includes("stock_alerts.read") || permissions.includes("stock_alerts.manage");
  const canManage = permissions.includes("stock_alerts.manage");

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [manualForm, setManualForm] = useState({
    warehouseId: "",
    productVariantId: "",
    note: "",
  });

  const selectedWarehouseId = Number(warehouseId);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [warehouseRes, variantRes] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }),
        fetch("/api/product-variants", { cache: "no-store" }),
      ]);
      const [warehouseData, variantData] = await Promise.all([
        readJson<Warehouse[]>(warehouseRes, "Failed to load warehouses"),
        readJson<Variant[]>(variantRes, "Failed to load variants"),
      ]);
      setWarehouses(warehouseData);
      setVariants(variantData);
      if (!warehouseId && warehouseData.length > 0) {
        setWarehouseId(String(warehouseData[0].id));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const loadAlerts = async () => {
    try {
      const qs = new URLSearchParams();
      if (warehouseId) qs.set("warehouseId", warehouseId);
      if (status) qs.set("status", status);
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/scm/reorder-alerts?${qs.toString()}`, {
        cache: "no-store",
      });
      const data = await readJson<AlertRow[]>(res, "Failed to load alerts");
      setAlerts(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load alerts");
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!canRead) return;
    void loadAlerts();
  }, [warehouseId, status, search, canRead]);

  const createManual = async () => {
    if (!manualForm.warehouseId || !manualForm.productVariantId) {
      toast.error("Warehouse and variant are required.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/scm/reorder-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: Number(manualForm.warehouseId),
          productVariantId: Number(manualForm.productVariantId),
          note: manualForm.note,
        }),
      });
      await readJson(res, "Failed to create alert");
      toast.success("Alert created");
      setManualForm({ warehouseId: "", productVariantId: "", note: "" });
      await loadAlerts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create alert");
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (id: number, nextStatus: AlertRow["status"]) => {
    try {
      const res = await fetch("/api/scm/reorder-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      await readJson(res, "Failed to update alert");
      toast.success("Alert updated");
      await loadAlerts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update alert");
    }
  };

  const scanAlerts = async () => {
    if (!canManage) return;
    setScanLoading(true);
    try {
      const res = await fetch("/api/scm/reorder-alerts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: warehouseId ? Number(warehouseId) : undefined,
        }),
      });
      const data = await readJson<{ created: number }>(res, "Failed to scan alerts");
      toast.success(`Created ${data.created} alert(s).`);
      await loadAlerts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to scan alerts");
    } finally {
      setScanLoading(false);
    }
  };

  const filteredVariants = useMemo(
    () =>
      variants.map((variant) => ({
        value: String(variant.id),
        label: `${variant.product?.name || "Variant"} (${variant.sku})`,
      })),
    [variants],
  );

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You do not have permission to access stock alerts.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reorder Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Review low stock signals and manage replenishment notifications.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button variant="outline" onClick={() => void scanAlerts()} disabled={scanLoading}>
              <RefreshCw className={scanLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Scan Stock
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void loadAlerts()} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter alerts by warehouse, status, or SKU.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label>Warehouse</Label>
            <select
              className="w-64 rounded-md border bg-background px-3 py-2"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              className="w-48 rounded-md border bg-background px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="SKU or product"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Manual Alert</CardTitle>
            <CardDescription>Open a single alert for a specific variant.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[220px_1fr_1fr_180px]">
            <select
              className="rounded-md border bg-background px-3 py-2"
              value={manualForm.warehouseId}
              onChange={(e) => setManualForm((cur) => ({ ...cur, warehouseId: e.target.value }))}
            >
              <option value="">Warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border bg-background px-3 py-2"
              value={manualForm.productVariantId}
              onChange={(e) => setManualForm((cur) => ({ ...cur, productVariantId: e.target.value }))}
            >
              <option value="">Variant</option>
              {filteredVariants.map((variant) => (
                <option key={variant.value} value={variant.value}>
                  {variant.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="Note (optional)"
              value={manualForm.note}
              onChange={(e) => setManualForm((cur) => ({ ...cur, note: e.target.value }))}
            />
            <Button onClick={() => void createManual()} disabled={creating}>
              Create
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Alert Register</CardTitle>
          <CardDescription>Track open, acknowledged, and resolved alerts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead className="text-right">Suggested</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No alerts found.
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <div className="font-medium">{alert.warehouse.name}</div>
                      <div className="text-xs text-muted-foreground">{alert.warehouse.code}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{alert.productVariant.product.name}</div>
                      <div className="text-xs text-muted-foreground">{alert.productVariant.sku}</div>
                    </TableCell>
                    <TableCell className="text-right">{alert.stockOnHand}</TableCell>
                    <TableCell className="text-right">{alert.threshold}</TableCell>
                    <TableCell className="text-right">{alert.suggestedQty}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <select
                          className="rounded-md border bg-background px-2 py-1 text-xs"
                          value={alert.status}
                          onChange={(e) => void updateStatus(alert.id, e.target.value as AlertRow["status"])}
                        >
                          <option value="OPEN">Open</option>
                          <option value="ACKNOWLEDGED">Acknowledged</option>
                          <option value="RESOLVED">Resolved</option>
                        </select>
                      ) : (
                        <span className="text-xs font-semibold">{alert.status}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
