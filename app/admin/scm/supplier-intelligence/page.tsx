"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SupplierIntelligenceRow = {
  supplier: {
    id: number;
    code: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    configuredLeadTimeDays: number | null;
    paymentTermsDays: number | null;
  };
  metrics: {
    trackedPoCount: number;
    completedPoCount: number;
    activePoCount: number;
    openLatePoCount: number;
    partialReceiptPoCount: number;
    onTimeRatePercent: number | null;
    averageFirstReceiptLeadTimeDays: number | null;
    averageFinalReceiptLeadTimeDays: number | null;
    recommendedLeadTimeDays: number | null;
    recommendedBufferDays: number | null;
    averageDelayDays: number | null;
    averageFillRatePercent: number | null;
    partialReceiptRatePercent: number | null;
    performanceBand: "STABLE" | "WATCH" | "AT_RISK" | "INSUFFICIENT_DATA";
    latestReceiptAt: string | null;
  };
  recentOrders: Array<{
    id: number;
    poNumber: string;
    warehouse: { id: number; name: string; code: string };
    status: string;
    orderDate: string;
    anchorDate: string;
    expectedAt: string | null;
    benchmarkDueAt: string | null;
    firstReceiptAt: string | null;
    finalReceiptAt: string | null;
    configuredLeadTimeDays: number | null;
    benchmarkLeadTimeDays: number | null;
    firstReceiptLeadTimeDays: number | null;
    finalReceiptLeadTimeDays: number | null;
    delayDays: number;
    fillRatePercent: number;
    isCompleted: boolean;
    isPartiallyReceived: boolean;
    isOnTime: boolean | null;
    isLateOpen: boolean;
  }>;
};

type SupplierIntelligenceResponse = {
  generatedAt: string;
  windowDays: number;
  overview: {
    supplierCount: number;
    trackedPoCount: number;
    completedPoCount: number;
    openLatePoCount: number;
    averageObservedLeadTimeDays: number | null;
    averageRecommendedLeadTimeDays: number | null;
    averageOnTimeRatePercent: number | null;
    atRiskSupplierCount: number;
    stableSupplierCount: number;
  };
  rows: SupplierIntelligenceRow[];
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatNumber(value: number | null, suffix = "") {
  if (value === null || Number.isNaN(value)) return "-";
  return `${value}${suffix}`;
}

function getBandVariant(band: SupplierIntelligenceRow["metrics"]["performanceBand"]) {
  if (band === "STABLE") return "default" as const;
  if (band === "WATCH") return "secondary" as const;
  if (band === "AT_RISK") return "destructive" as const;
  return "outline" as const;
}

export default function SupplierIntelligencePage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canRead = globalPermissions.includes("supplier_performance.read");

  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState("365");
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [bandFilter, setBandFilter] = useState("ALL");
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [dataset, setDataset] = useState<SupplierIntelligenceResponse>({
    generatedAt: "",
    windowDays: 365,
    overview: {
      supplierCount: 0,
      trackedPoCount: 0,
      completedPoCount: 0,
      openLatePoCount: 0,
      averageObservedLeadTimeDays: null,
      averageRecommendedLeadTimeDays: null,
      averageOnTimeRatePercent: null,
      atRiskSupplierCount: 0,
      stableSupplierCount: 0,
    },
    rows: [],
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/scm/supplier-intelligence?windowDays=${encodeURIComponent(windowDays)}`,
        {
          cache: "no-store",
        },
      );
      const data = await readJson<SupplierIntelligenceResponse>(
        response,
        "Failed to load supplier intelligence data",
      );
      setDataset(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load supplier intelligence data");
      setDataset((current) => ({ ...current, rows: [] }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadData();
    }
  }, [canRead, windowDays]);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dataset.rows.filter((row) => {
      if (bandFilter !== "ALL" && row.metrics.performanceBand !== bandFilter) {
        return false;
      }
      if (!query) return true;
      return (
        row.supplier.name.toLowerCase().includes(query) ||
        row.supplier.code.toLowerCase().includes(query) ||
        (row.supplier.email || "").toLowerCase().includes(query)
      );
    });
  }, [bandFilter, dataset.rows, search]);

  useEffect(() => {
    if (visibleRows.length === 0) {
      setSelectedSupplierId(null);
      return;
    }
    if (!visibleRows.some((row) => row.supplier.id === selectedSupplierId)) {
      setSelectedSupplierId(visibleRows[0]?.supplier.id ?? null);
    }
  }, [selectedSupplierId, visibleRows]);

  const selectedSupplier =
    visibleRows.find((row) => row.supplier.id === selectedSupplierId) ?? visibleRows[0] ?? null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Compare configured supplier lead times against real PO-to-receipt performance.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={windowDays}
            onChange={(event) => setWindowDays(event.target.value)}
          >
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
            <option value="365">Last 365 days</option>
            <option value="730">Last 730 days</option>
          </select>
          <Button variant="outline" onClick={() => void loadData()} disabled={loading || !canRead}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Suppliers Tracked</CardDescription>
            <CardTitle>{dataset.overview.supplierCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tracked POs</CardDescription>
            <CardTitle>{dataset.overview.trackedPoCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observed Lead Time</CardDescription>
            <CardTitle>{formatNumber(dataset.overview.averageObservedLeadTimeDays, " d")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average On-Time Rate</CardDescription>
            <CardTitle>{formatNumber(dataset.overview.averageOnTimeRatePercent, "%")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Late POs</CardDescription>
            <CardTitle>{dataset.overview.openLatePoCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Supplier Lead-Time Scorecard</CardTitle>
            <CardDescription>
              Recommended lead time uses real receipt history and keeps the configured baseline when it is already safer.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search supplier name, code, or email..."
              className="w-full md:w-80"
            />
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={bandFilter}
              onChange={(event) => setBandFilter(event.target.value)}
            >
              <option value="ALL">All bands</option>
              <option value="STABLE">Stable</option>
              <option value="WATCH">Watch</option>
              <option value="AT_RISK">At Risk</option>
              <option value="INSUFFICIENT_DATA">Insufficient Data</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {!canRead ? (
            <p className="text-sm text-muted-foreground">You do not have access to supplier intelligence.</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading supplier intelligence...</p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No supplier intelligence records found for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Configured LT</TableHead>
                  <TableHead>Observed LT</TableHead>
                  <TableHead>Recommended LT</TableHead>
                  <TableHead>On-Time</TableHead>
                  <TableHead>Open Late</TableHead>
                  <TableHead>Partial Rate</TableHead>
                  <TableHead>Band</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => {
                  const isSelected = row.supplier.id === selectedSupplier?.supplier.id;
                  return (
                    <TableRow
                      key={row.supplier.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedSupplierId(row.supplier.id)}
                      data-state={isSelected ? "selected" : undefined}
                    >
                      <TableCell>
                        <div className="font-medium">{row.supplier.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.supplier.code}
                          {row.supplier.contactName ? ` • ${row.supplier.contactName}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>{formatNumber(row.supplier.configuredLeadTimeDays, " d")}</TableCell>
                      <TableCell>{formatNumber(row.metrics.averageFinalReceiptLeadTimeDays, " d")}</TableCell>
                      <TableCell>{formatNumber(row.metrics.recommendedLeadTimeDays, " d")}</TableCell>
                      <TableCell>{formatNumber(row.metrics.onTimeRatePercent, "%")}</TableCell>
                      <TableCell>{row.metrics.openLatePoCount}</TableCell>
                      <TableCell>{formatNumber(row.metrics.partialReceiptRatePercent, "%")}</TableCell>
                      <TableCell>
                        <Badge variant={getBandVariant(row.metrics.performanceBand)}>
                          {row.metrics.performanceBand.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedSupplier ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedSupplier.supplier.name}</CardTitle>
            <CardDescription>
              Configured lead time {formatNumber(selectedSupplier.supplier.configuredLeadTimeDays, " days")} •
              Recommended {formatNumber(selectedSupplier.metrics.recommendedLeadTimeDays, " days")} • Last receipt{" "}
              {formatDate(selectedSupplier.metrics.latestReceiptAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-6">
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Completed POs</div>
                <div className="text-lg font-semibold">{selectedSupplier.metrics.completedPoCount}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Avg First Receipt</div>
                <div className="text-lg font-semibold">
                  {formatNumber(selectedSupplier.metrics.averageFirstReceiptLeadTimeDays, " d")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Avg Final Receipt</div>
                <div className="text-lg font-semibold">
                  {formatNumber(selectedSupplier.metrics.averageFinalReceiptLeadTimeDays, " d")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Avg Delay</div>
                <div className="text-lg font-semibold">
                  {formatNumber(selectedSupplier.metrics.averageDelayDays, " d")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Fill Rate</div>
                <div className="text-lg font-semibold">
                  {formatNumber(selectedSupplier.metrics.averageFillRatePercent, "%")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">Suggested Buffer</div>
                <div className="text-lg font-semibold">
                  {formatNumber(selectedSupplier.metrics.recommendedBufferDays, " d")}
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>First Receipt</TableHead>
                  <TableHead>Final Receipt</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Delay</TableHead>
                  <TableHead>Fill Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedSupplier.recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="font-medium">{order.poNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        Ordered {formatDate(order.orderDate)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {order.warehouse.name}
                      <div className="text-xs text-muted-foreground">{order.warehouse.code}</div>
                    </TableCell>
                    <TableCell>
                      <div>{order.status}</div>
                      {order.isLateOpen ? (
                        <div className="text-xs text-destructive">Open late</div>
                      ) : order.isOnTime === false ? (
                        <div className="text-xs text-destructive">Delivered late</div>
                      ) : order.isOnTime === true ? (
                        <div className="text-xs text-emerald-600">On time</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatDate(order.benchmarkDueAt)}</TableCell>
                    <TableCell>{formatDate(order.firstReceiptAt)}</TableCell>
                    <TableCell>{formatDate(order.finalReceiptAt)}</TableCell>
                    <TableCell>{formatNumber(order.finalReceiptLeadTimeDays, " d")}</TableCell>
                    <TableCell>{formatNumber(order.delayDays || 0, " d")}</TableCell>
                    <TableCell>{formatNumber(order.fillRatePercent, "%")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
