"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Warehouse = { id: number; name: string; code: string };

type DailyRow = {
  warehouse: Warehouse;
  variant: { id: number; sku: string; product: { id: number; name: string } };
  quantity: number;
  reserved: number;
  available: number;
  status: string;
};

type AgingRow = {
  warehouse: Warehouse;
  variant: { id: number; sku: string; product: { id: number; name: string } };
  quantity: number;
  reserved: number;
  available: number;
  lastMovement: string | null;
  ageDays: number | null;
};

type MonthlyRow = {
  warehouse: Warehouse | null;
  daysTracked: number;
  avgQuantity: number;
  avgReserved: number;
  avgAvailable: number;
  endQuantity: number;
  endReserved: number;
  endAvailable: number;
  endDate: string | null;
};

async function readJson<T>(res: Response, errorMessage: string) {
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || errorMessage);
  }
  return (await res.json()) as T;
}

function fmtDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default function StockReportsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canRead = permissions.includes("stock_reports.read") || permissions.includes("inventory.manage");

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState(searchParams.get("warehouseId") || "");
  const [tab, setTab] = useState(searchParams.get("tab") || "daily");
  const [dailyDate, setDailyDate] = useState(() => fmtDate(new Date()));
  const [monthlyFrom, setMonthlyFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return fmtDate(d);
  });
  const [monthlyTo, setMonthlyTo] = useState(() => fmtDate(new Date()));
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const [agingRows, setAgingRows] = useState<AgingRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedWarehouseId = Number(warehouseId);

  const loadWarehouses = async () => {
    const res = await fetch("/api/warehouses", { cache: "no-store" });
    const data = await readJson<Warehouse[]>(res, "Failed to load warehouses");
    setWarehouses(data);
    if (!warehouseId && data.length > 0) {
      setWarehouseId(String(data[0].id));
    }
  };

  const loadDaily = async () => {
    const qs = new URLSearchParams({ type: "daily", date: dailyDate });
    if (warehouseId) qs.set("warehouseId", warehouseId);
    const res = await fetch(`/api/scm/stock-reports?${qs.toString()}`, { cache: "no-store" });
    const data = await readJson<{ rows: DailyRow[] }>(res, "Failed to load daily report");
    setDailyRows(data.rows || []);
  };

  const loadAging = async () => {
    const qs = new URLSearchParams({ type: "aging" });
    if (warehouseId) qs.set("warehouseId", warehouseId);
    const res = await fetch(`/api/scm/stock-reports?${qs.toString()}`, { cache: "no-store" });
    const data = await readJson<{ rows: AgingRow[] }>(res, "Failed to load aging report");
    setAgingRows(data.rows || []);
  };

  const loadMonthly = async () => {
    const qs = new URLSearchParams({ type: "monthly", from: monthlyFrom, to: monthlyTo });
    if (warehouseId) qs.set("warehouseId", warehouseId);
    const res = await fetch(`/api/scm/stock-reports?${qs.toString()}`, { cache: "no-store" });
    const data = await readJson<{ rows: MonthlyRow[] }>(res, "Failed to load monthly summary");
    setMonthlyRows(data.rows || []);
  };

  const refresh = async () => {
    if (!canRead) return;
    setLoading(true);
    try {
      if (tab === "daily") await loadDaily();
      if (tab === "aging") await loadAging();
      if (tab === "monthly") await loadMonthly();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWarehouses();
  }, []);

  useEffect(() => {
    setWarehouseId(searchParams.get("warehouseId") || "");
    setTab(searchParams.get("tab") || "daily");
  }, [searchParams]);

  useEffect(() => {
    if (!canRead) return;
    void refresh();
  }, [tab, warehouseId, dailyDate, monthlyFrom, monthlyTo, canRead]);

  const dailySummary = useMemo(() => {
    return dailyRows.reduce(
      (acc, row) => {
        acc.quantity += row.quantity;
        acc.reserved += row.reserved;
        acc.available += row.available;
        return acc;
      },
      { quantity: 0, reserved: 0, available: 0 },
    );
  }, [dailyRows]);

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You do not have permission to access stock reports.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stock Reports</h1>
          <p className="text-sm text-muted-foreground">
            Daily snapshots, aging view, and monthly warehouse summary reports.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Pick warehouse scope and date ranges.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label>Warehouse</Label>
            <select
              className="rounded-md border bg-background px-3 py-2"
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
          {tab === "daily" ? (
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
            </div>
          ) : null}
          {tab === "monthly" ? (
            <>
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" value={monthlyFrom} onChange={(e) => setMonthlyFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="date" value={monthlyTo} onChange={(e) => setMonthlyTo(e.target.value)} />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="daily">Daily Stock</TabsTrigger>
          <TabsTrigger value="aging">Stock Aging</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase text-muted-foreground">Total Qty</div>
                <div className="text-xl font-semibold">{dailySummary.quantity}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase text-muted-foreground">Reserved</div>
                <div className="text-xl font-semibold">{dailySummary.reserved}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs uppercase text-muted-foreground">Available</div>
                <div className="text-xl font-semibold">{dailySummary.available}</div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Daily Snapshot</CardTitle>
              <CardDescription>Stock by variant and warehouse.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No daily stock rows found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailyRows.map((row) => (
                      <TableRow key={`${row.warehouse.id}-${row.variant.id}`}>
                        <TableCell>
                          <div className="font-medium">{row.warehouse.name}</div>
                          <div className="text-xs text-muted-foreground">{row.warehouse.code}</div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/scm/stock-cards?warehouseId=${row.warehouse.id}&variantId=${row.variant.id}&search=${encodeURIComponent(row.variant.sku)}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {row.variant.product.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{row.variant.sku}</div>
                        </TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                        <TableCell className="text-right">{row.reserved}</TableCell>
                        <TableCell className="text-right">{row.available}</TableCell>
                        <TableCell className="text-xs uppercase">{row.status.replaceAll("_", " ")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock Aging</CardTitle>
              <CardDescription>Days since last stock movement per variant.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Age (days)</TableHead>
                    <TableHead>Last Movement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No aging records found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    agingRows.map((row) => (
                      <TableRow key={`${row.warehouse.id}-${row.variant.id}`}>
                        <TableCell>
                          <div className="font-medium">{row.warehouse.name}</div>
                          <div className="text-xs text-muted-foreground">{row.warehouse.code}</div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/scm/stock-cards?warehouseId=${row.warehouse.id}&variantId=${row.variant.id}&search=${encodeURIComponent(row.variant.sku)}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {row.variant.product.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{row.variant.sku}</div>
                        </TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                        <TableCell className="text-right">{row.available}</TableCell>
                        <TableCell className="text-right">{row.ageDays ?? "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.lastMovement ? new Date(row.lastMovement).toLocaleString() : "N/A"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Warehouse Summary</CardTitle>
              <CardDescription>Average and ending stock positions per warehouse.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right">Days Tracked</TableHead>
                    <TableHead className="text-right">Avg Qty</TableHead>
                    <TableHead className="text-right">Avg Available</TableHead>
                    <TableHead className="text-right">End Qty</TableHead>
                    <TableHead>Last Snapshot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No monthly summary rows found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    monthlyRows.map((row, index) => (
                      <TableRow key={`${row.warehouse?.id ?? "all"}-${index}`}>
                        <TableCell>
                          {row.warehouse ? (
                            <>
                              <Link
                                href={`/admin/scm/stock-cards?warehouseId=${row.warehouse.id}`}
                                className="font-medium underline-offset-4 hover:underline"
                              >
                                {row.warehouse.name}
                              </Link>
                              <div className="text-xs text-muted-foreground">{row.warehouse.code}</div>
                            </>
                          ) : (
                            "N/A"
                          )}
                        </TableCell>
                        <TableCell className="text-right">{row.daysTracked}</TableCell>
                        <TableCell className="text-right">{row.avgQuantity.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{row.avgAvailable.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{row.endQuantity}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.endDate ? new Date(row.endDate).toLocaleDateString() : "N/A"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
