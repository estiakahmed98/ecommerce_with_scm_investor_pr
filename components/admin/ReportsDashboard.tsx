"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Download,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReportsResponse = {
  filters: { from: string; to: string };
  sales: {
    summary: {
      totalOrders: number;
      deliveredOrders: number;
      paidOrders: number;
      subtotal: number;
      shippingTotal: number;
      vatTotal: number;
      grandTotal: number;
      refundTotal: number;
      netSales: number;
      unpaidTotal: number;
      averageOrderValue: number;
    };
    daily: Array<{
      date: string;
      orders: number;
      revenue: number;
      vat: number;
    }>;
    topProducts: Array<{
      productId: number;
      name: string;
      quantity: number;
      revenue: number;
    }>;
  };
  profit: {
    summary: {
      grossSales: number;
      estimatedCost: number;
      refundedEstimatedCost: number;
      netProfit: number;
      netMarginPct: number;
      completedRefunds: number;
      refundedUnits: number;
    };
    topVariants: Array<{
      variantId: number;
      sku: string;
      productName: string;
      optionsText: string;
      quantity: number;
      revenue: number;
      estimatedCost: number;
      grossProfit: number;
    }>;
  };
  vat: {
    summary: {
      totalVatCollected: number;
      inclusiveVatTotal: number;
      exclusiveVatTotal: number;
      taxedOrders: number;
    };
    byCountry: Array<{ country: string; vatAmount: number; orders: number }>;
    byClass: Array<{
      className: string;
      classCode: string;
      rate: number;
      inclusive: boolean;
      vatAmount: number;
    }>;
  };
  inventory: {
    summary: {
      totalVariants: number;
      totalUnits: number;
      reservedUnits: number;
      lowStockCount: number;
      outOfStockCount: number;
      movementIn: number;
      movementOut: number;
    };
    warehouses: Array<{
      warehouseId: number;
      name: string;
      code: string;
      quantity: number;
      reserved: number;
    }>;
    lowStock: Array<{
      variantId: number;
      sku: string;
      productName: string;
      stock: number;
      status: string;
    }>;
    movementReasons: Array<{ reason: string; change: number; events: number }>;
    recentLogs: Array<{
      id: number;
      createdAt: string;
      productName: string;
      variantSku: string;
      warehouseName: string;
      change: number;
    }>;
  };
  delivery: {
    summary: {
      totalShipments: number;
      delivered: number;
      outForDelivery: number;
      inTransit: number;
      returned: number;
      cancelled: number;
      proofConfirmed: number;
      proofPending: number;
    };
    byCourier: Array<{
      courier: string;
      shipments: number;
      delivered: number;
      proofs: number;
    }>;
    exceptions: Array<{
      shipmentId: number;
      orderId: number;
      courier: string;
      status: string;
      customer: string;
      phone: string;
      proofStatus: string;
    }>;
  };
};

type ExportSection = "sales" | "profit" | "vat" | "inventory" | "delivery";
type ReportTab = "overview" | ExportSection;

const QUICK_RANGES = [
  { label: "Last 7 days", days: 6 },
  { label: "Last 30 days", days: 29 },
  { label: "Last 90 days", days: 89 },
];

function fmtDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value || 0);
}
function fmtNum(value: number) {
  return new Intl.NumberFormat("en-BD").format(value || 0);
}
function shiftRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return { from: fmtDate(from), to: fmtDate(to) };
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const cls =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/5"
        : "border-border/60 bg-card/95";
  return (
    <Card className={`${cls} shadow-sm`}>
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-3 text-2xl font-semibold">{value}</div>
        {hint ? (
          <div className="mt-2 text-sm text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Header({
  title,
  description,
  onExport,
}: {
  title: string;
  description: string;
  onExport: () => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onExport}>
        <Download className="h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );
}

function GridTable({
  headers,
  rows,
  empty,
  cols,
}: {
  headers: string[];
  rows: React.ReactNode;
  empty: string;
  cols: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows || (
          <TableRow>
            <TableCell
              colSpan={cols}
              className="text-center text-muted-foreground"
            >
              {empty}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export default function ReportsDashboard() {
  const initialFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return fmtDate(d);
  }, []);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(() => fmtDate(new Date()));
  const [tab, setTab] = useState<ReportTab>("overview");
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = async (nextFrom: string, nextTo: string) => {
    try {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({ from: nextFrom, to: nextTo });
      const res = await fetch(`/api/reports/overview?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => ({})))?.error ||
            `Failed to load reports (${res.status})`,
        );
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(from, to);
  }, []);

  const apply = () =>
    startTransition(() => {
      void load(from, to);
    });
  const quick = (days: number) => {
    const next = shiftRange(days);
    setFrom(next.from);
    setTo(next.to);
    startTransition(() => {
      void load(next.from, next.to);
    });
  };
  const exportTab = (section: ExportSection) => {
    const qs = new URLSearchParams({ section, from, to });
    window.open(
      `/api/reports/export?${qs.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const topMetrics = useMemo(
    () =>
      data
        ? [
            {
              label: "Net Sales",
              value: fmtMoney(data.sales.summary.netSales),
              hint: `${fmtMoney(data.sales.summary.refundTotal)} refund impact`,
            },
            {
              label: "Net Profit",
              value: fmtMoney(data.profit.summary.netProfit),
              hint: `${data.profit.summary.netMarginPct.toFixed(2)}% net margin`,
              tone: "good" as const,
            },
            {
              label: "Collected VAT",
              value: fmtMoney(data.vat.summary.totalVatCollected),
              hint: `${fmtNum(data.vat.summary.taxedOrders)} taxed orders`,
            },
            {
              label: "Low Stock",
              value: fmtNum(data.inventory.summary.lowStockCount),
              hint: `${fmtNum(data.inventory.summary.outOfStockCount)} out of stock`,
              tone:
                data.inventory.summary.lowStockCount > 0
                  ? ("warn" as const)
                  : ("good" as const),
            },
            {
              label: "Proof Pending",
              value: fmtNum(data.delivery.summary.proofPending),
              hint: `${fmtNum(data.delivery.summary.proofConfirmed)} confirmed proofs`,
              tone:
                data.delivery.summary.proofPending > 0
                  ? ("warn" as const)
                  : ("good" as const),
            },
          ]
        : [],
    [data],
  );

  const alerts = useMemo(
    () =>
      data
        ? [
            {
              title: "Refund pressure",
              text: `${fmtNum(data.profit.summary.completedRefunds)} completed refunds in this range.`,
              active: data.profit.summary.completedRefunds > 0,
            },
            {
              title: "Stock pressure",
              text: `${fmtNum(data.inventory.summary.lowStockCount)} variants need replenishment.`,
              active: data.inventory.summary.lowStockCount > 0,
            },
            {
              title: "Proof gaps",
              text: `${fmtNum(data.delivery.summary.proofPending)} shipments still need customer proof.`,
              active: data.delivery.summary.proofPending > 0,
            },
          ].filter((x) => x.active)
        : [],
    [data],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-[30px] border border-border/60 bg-gradient-to-br from-card via-card to-muted/35 p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Commerce Insights
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Executive Dashboard Overview
                </h1>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Get a clear, real-time view of your business performance at a
                  glance. Monitor key metrics from sales and profitability to
                  VAT, inventory, and delivery — all in one streamlined
                  dashboard designed for smarter decisions.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {QUICK_RANGES.map((item) => (
              <Button
                key={item.label}
                className="btn-outline"
                size="sm"
                onClick={() => quick(item.days)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-20 rounded-[24px] border border-border/70 bg-background/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reports-from">
                From
              </label>
              <Input
                id="reports-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reports-to">
                To
              </label>
              <Input
                id="reports-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tab !== "overview" ? (
              <Button variant="outline" onClick={() => exportTab(tab)}>
                <Download className="h-4 w-4" />
                Export {tab}
              </Button>
            ) : null}
            <Button onClick={apply} disabled={loading || pending}>
              {loading || pending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Apply filters
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {topMetrics.map((m) => (
          <Metric
            key={m.label}
            label={m.label}
            value={m.value}
            hint={m.hint}
            tone={m.tone}
          />
        ))}
      </div>

      {data ? (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ReportTab)}
          className="space-y-6"
        >
          <TabsList className="w-full justify-start overflow-x-auto rounded-[20px] border border-border/60 bg-card/85 p-1.5">
            <TabsTrigger
              value="overview"
              className="rounded-2xl px-4 py-2.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary/80 hover:data-[state=active]:text-primary-foreground/80  hover:bg-primary/80 hover:text-primary-foreground/80"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="rounded-2xl px-4 py-2.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary hover:data-[state=active]:text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground/80"
            >
              Sales
            </TabsTrigger>
            <TabsTrigger
              value="profit"
              className="rounded-2xl px-4 py-2.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary hover:data-[state=active]:text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground/80"
            >
              Profit
            </TabsTrigger>
            <TabsTrigger
              value="vat"
              className="rounded-2xl px-4 py-2.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary hover:data-[state=active]:text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground/80"
            >
              VAT
            </TabsTrigger>
            <TabsTrigger
              value="inventory"
              className="rounded-2xl px-4 py-2.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary hover:data-[state=active]:text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground/80"
            >
              Inventory
            </TabsTrigger>
            <TabsTrigger
              value="delivery"
              className="rounded-2xl px-4 py-2.5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary hover:data-[state=active]:text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground/80"
            >
              Delivery
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Sales Pulse</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Gross vs net sales across the selected window.
                    </div>
                    <div className="mt-3 text-lg font-semibold">
                      {fmtMoney(data.sales.summary.grandTotal)} gross /{" "}
                      {fmtMoney(data.sales.summary.netSales)} net
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Tax Snapshot</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      VAT captured from saved order-time tax snapshots.
                    </div>
                    <div className="mt-3 text-lg font-semibold">
                      {fmtMoney(data.vat.summary.totalVatCollected)} VAT
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      Delivery Confidence
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Courier completion and customer proof capture posture.
                    </div>
                    <div className="mt-3 text-lg font-semibold">
                      {fmtNum(data.delivery.summary.delivered)} delivered /{" "}
                      {fmtNum(data.delivery.summary.proofPending)} pending proof
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Inventory Health</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Tracked units and replenishment pressure.
                    </div>
                    <div className="mt-3 text-lg font-semibold">
                      {fmtNum(data.inventory.summary.totalUnits)} units /{" "}
                      {fmtNum(data.inventory.summary.lowStockCount)} low stock
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Executive Snapshot</CardTitle>
                  <CardDescription>
                    {data.filters.from} to {data.filters.to}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Metric
                    label="Orders"
                    value={fmtNum(data.sales.summary.totalOrders)}
                    hint={`${fmtNum(data.sales.summary.deliveredOrders)} delivered`}
                  />
                  <Metric
                    label="Avg Order Value"
                    value={fmtMoney(data.sales.summary.averageOrderValue)}
                  />
                  <Metric
                    label="Refunds"
                    value={fmtMoney(data.sales.summary.refundTotal)}
                    hint={`${fmtNum(data.profit.summary.completedRefunds)} completed refunds`}
                  />
                  <Metric
                    label="Warehouse Units"
                    value={fmtNum(data.inventory.summary.totalUnits)}
                    hint={`${fmtNum(data.inventory.summary.reservedUnits)} reserved`}
                  />
                  <Metric
                    label="Courier Delivered"
                    value={fmtNum(data.delivery.summary.delivered)}
                    hint={`${fmtNum(data.delivery.summary.inTransit)} still in transit`}
                  />
                  <Metric
                    label="VAT"
                    value={fmtMoney(data.vat.summary.totalVatCollected)}
                    hint={`${fmtMoney(data.vat.summary.exclusiveVatTotal)} tax added on top`}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Priority Alerts</CardTitle>
                  <CardDescription>
                    Fastest issues to review first.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {alerts.length ? (
                    alerts.map((a) => (
                      <div
                        key={a.title}
                        className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"
                      >
                        <div className="text-sm font-medium">{a.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {a.text}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700">
                      No major report alerts in this range.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Products</CardTitle>
                  <CardDescription>
                    Highest revenue products in the selected range.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Product", "Qty", "Revenue"],
                    cols: 3,
                    empty: "No product sales found.",
                    rows: data.sales.topProducts.slice(0, 5).map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.quantity)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(row.revenue)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Exceptions</CardTitle>
                  <CardDescription>
                    Current courier exceptions needing follow-up.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Shipment", "Courier", "Status"],
                    cols: 3,
                    empty: "No delivery exceptions in this range.",
                    rows: data.delivery.exceptions.slice(0, 5).map((row) => (
                      <TableRow key={row.shipmentId}>
                        <TableCell>#{row.shipmentId}</TableCell>
                        <TableCell>{row.courier}</TableCell>
                        <TableCell className="text-right">
                          {row.status.replaceAll("_", " ")}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sales" className="space-y-6">
            <Header
              title="Sales Report"
              description={`Revenue and order flow from ${data.filters.from} to ${data.filters.to}.`}
              onExport={() => exportTab("sales")}
            />
            <div className="grid gap-4 lg:grid-cols-4">
              <Metric
                label="Gross Revenue"
                value={fmtMoney(data.sales.summary.grandTotal)}
                hint={`${fmtMoney(data.sales.summary.averageOrderValue)} average order`}
              />
              <Metric
                label="Net Sales"
                value={fmtMoney(data.sales.summary.netSales)}
                hint={`${fmtMoney(data.sales.summary.refundTotal)} refunds`}
              />
              <Metric
                label="Subtotal"
                value={fmtMoney(data.sales.summary.subtotal)}
                hint={`${fmtMoney(data.sales.summary.shippingTotal)} shipping collected`}
              />
              <Metric
                label="Paid Orders"
                value={fmtNum(data.sales.summary.paidOrders)}
                hint={`${fmtMoney(data.sales.summary.unpaidTotal)} unpaid value`}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Daily Revenue</CardTitle>
                  <CardDescription>
                    Daily order volume, revenue and VAT.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Date", "Orders", "Revenue", "VAT"],
                    cols: 4,
                    empty: "No sales data in this range.",
                    rows: data.sales.daily.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.orders)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(row.vat)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Top Selling Products</CardTitle>
                  <CardDescription>
                    Highest revenue products in the selected range.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Product", "Qty", "Revenue"],
                    cols: 3,
                    empty: "No product sales found.",
                    rows: data.sales.topProducts.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.quantity)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(row.revenue)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="profit" className="space-y-6">
            <Header
              title="Profit Report"
              description="Estimated gross and net margin using stored purchase-cost snapshots."
              onExport={() => exportTab("profit")}
            />
            <div className="grid gap-4 lg:grid-cols-4">
              <Metric
                label="Gross Sales"
                value={fmtMoney(data.profit.summary.grossSales)}
              />
              <Metric
                label="Estimated Cost"
                value={fmtMoney(data.profit.summary.estimatedCost)}
              />
              <Metric
                label="Net Profit"
                value={fmtMoney(data.profit.summary.netProfit)}
                hint={`${data.profit.summary.netMarginPct.toFixed(2)}% net margin`}
                tone="good"
              />
              <Metric
                label="Refund Impact"
                value={fmtNum(data.profit.summary.completedRefunds)}
                hint={`${fmtNum(data.profit.summary.refundedUnits)} refunded units`}
                tone={
                  data.profit.summary.completedRefunds > 0 ? "warn" : "default"
                }
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Top Profitable Variants</CardTitle>
                <CardDescription>
                  Variants with the highest estimated gross profit contribution.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {GridTable({
                  headers: [
                    "Variant",
                    "Product",
                    "Qty",
                    "Revenue",
                    "Cost",
                    "Profit",
                  ],
                  cols: 6,
                  empty: "No profit rows available in this range.",
                  rows: data.profit.topVariants.map((row) => (
                    <TableRow key={row.variantId}>
                      <TableCell>
                        <div className="font-medium">{row.sku}</div>
                        {row.optionsText ? (
                          <div className="text-xs text-muted-foreground">
                            {row.optionsText}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">
                        {fmtNum(row.quantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(row.revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(row.estimatedCost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(row.grossProfit)}
                      </TableCell>
                    </TableRow>
                  )) as unknown as React.ReactNode,
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vat" className="space-y-6">
            <Header
              title="VAT Report"
              description="Collected VAT grouped by tax class and shipping destination."
              onExport={() => exportTab("vat")}
            />
            <div className="grid gap-4 lg:grid-cols-4">
              <Metric
                label="Total VAT"
                value={fmtMoney(data.vat.summary.totalVatCollected)}
              />
              <Metric
                label="Inclusive VAT"
                value={fmtMoney(data.vat.summary.inclusiveVatTotal)}
              />
              <Metric
                label="Exclusive VAT"
                value={fmtMoney(data.vat.summary.exclusiveVatTotal)}
              />
              <Metric
                label="Taxed Orders"
                value={fmtNum(data.vat.summary.taxedOrders)}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>VAT by Country</CardTitle>
                  <CardDescription>
                    Collected VAT based on order destination.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Country", "Orders", "VAT"],
                    cols: 3,
                    empty: "No VAT data found for the selected range.",
                    rows: data.vat.byCountry.map((row) => (
                      <TableRow key={row.country}>
                        <TableCell>{row.country}</TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.orders)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(row.vatAmount)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>VAT by Class</CardTitle>
                  <CardDescription>
                    Tax class performance from saved order tax snapshots.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Class", "Rate", "Inclusive", "VAT"],
                    cols: 4,
                    empty: "No tax class snapshot rows found.",
                    rows: data.vat.byClass.map((row) => (
                      <TableRow
                        key={`${row.classCode}-${row.rate}-${row.inclusive ? "i" : "e"}`}
                      >
                        <TableCell>
                          <div className="font-medium">{row.className}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.classCode}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.rate.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {row.inclusive ? "Yes" : "No"}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtMoney(row.vatAmount)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <Header
              title="Inventory Report"
              description="Current stock snapshot plus movement activity inside the selected range."
              onExport={() => exportTab("inventory")}
            />
            <div className="grid gap-4 lg:grid-cols-4">
              <Metric
                label="Tracked Variants"
                value={fmtNum(data.inventory.summary.totalVariants)}
              />
              <Metric
                label="Units On Hand"
                value={fmtNum(data.inventory.summary.totalUnits)}
                hint={`${fmtNum(data.inventory.summary.reservedUnits)} reserved`}
              />
              <Metric
                label="Low Stock"
                value={fmtNum(data.inventory.summary.lowStockCount)}
                hint={`${fmtNum(data.inventory.summary.outOfStockCount)} out of stock`}
                tone={
                  data.inventory.summary.lowStockCount > 0 ? "warn" : "default"
                }
              />
              <Metric
                label="Movement"
                value={`${fmtNum(data.inventory.summary.movementIn)} in / ${fmtNum(data.inventory.summary.movementOut)} out`}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Warehouse Stock</CardTitle>
                  <CardDescription>
                    Current quantity and reserved units by warehouse.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Warehouse", "Quantity", "Reserved"],
                    cols: 3,
                    empty: "No warehouse stock records found.",
                    rows: data.inventory.warehouses.map((row) => (
                      <TableRow key={row.warehouseId}>
                        <TableCell>
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.code}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.quantity)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.reserved)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Low Stock Alerts</CardTitle>
                  <CardDescription>
                    Variants that need replenishment attention.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Variant", "Product", "Stock", "Status"],
                    cols: 4,
                    empty: "No low-stock alerts right now.",
                    rows: data.inventory.lowStock.map((row) => (
                      <TableRow key={row.variantId}>
                        <TableCell>{row.sku}</TableCell>
                        <TableCell>{row.productName}</TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.stock)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status.replaceAll("_", " ")}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Movement Reasons</CardTitle>
                  <CardDescription>
                    Net stock movement grouped by logged reason.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Reason", "Events", "Net Change"],
                    cols: 3,
                    empty: "No inventory movements logged in this range.",
                    rows: data.inventory.movementReasons
                      .slice(0, 10)
                      .map((row) => (
                        <TableRow key={row.reason}>
                          <TableCell>{row.reason}</TableCell>
                          <TableCell className="text-right">
                            {fmtNum(row.events)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtNum(row.change)}
                          </TableCell>
                        </TableRow>
                      )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Recent Inventory Logs</CardTitle>
                  <CardDescription>
                    Latest stock change events captured in the selected range.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["When", "Item", "Warehouse", "Change"],
                    cols: 4,
                    empty: "No inventory log rows found in this range.",
                    rows: data.inventory.recentLogs.slice(0, 10).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.productName}</div>
                          {row.variantSku ? (
                            <div className="text-xs text-muted-foreground">
                              {row.variantSku}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.warehouseName || "N/A"}</TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.change)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-6">
            <Header
              title="Delivery Report"
              description="Shipment outcomes and customer delivery proof coverage."
              onExport={() => exportTab("delivery")}
            />
            <div className="grid gap-4 lg:grid-cols-4">
              <Metric
                label="Shipments"
                value={fmtNum(data.delivery.summary.totalShipments)}
              />
              <Metric
                label="Delivered"
                value={fmtNum(data.delivery.summary.delivered)}
                hint={`${fmtNum(data.delivery.summary.outForDelivery)} out for delivery`}
              />
              <Metric
                label="Proof Confirmed"
                value={fmtNum(data.delivery.summary.proofConfirmed)}
                hint={`${fmtNum(data.delivery.summary.proofPending)} pending proof`}
                tone={data.delivery.summary.proofPending > 0 ? "warn" : "good"}
              />
              <Metric
                label="Returns / Cancelled"
                value={`${fmtNum(data.delivery.summary.returned)} / ${fmtNum(data.delivery.summary.cancelled)}`}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Courier Performance</CardTitle>
                  <CardDescription>
                    Shipment count, delivered count and proof coverage by
                    courier.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Courier", "Shipments", "Delivered", "Proofs"],
                    cols: 4,
                    empty: "No shipment activity found in this range.",
                    rows: data.delivery.byCourier.map((row) => (
                      <TableRow key={row.courier}>
                        <TableCell>{row.courier}</TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.shipments)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.delivered)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.proofs)}
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Exceptions</CardTitle>
                  <CardDescription>
                    Returned, cancelled or proof-missing shipment records.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {GridTable({
                    headers: ["Shipment", "Customer", "Courier", "Status"],
                    cols: 4,
                    empty: "No delivery exceptions in the selected range.",
                    rows: data.delivery.exceptions.map((row) => (
                      <TableRow key={row.shipmentId}>
                        <TableCell>
                          <div className="font-medium">#{row.shipmentId}</div>
                          <div className="text-xs text-muted-foreground">
                            Order #{row.orderId}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{row.customer}</div>
                          {row.phone ? (
                            <div className="text-xs text-muted-foreground">
                              {row.phone}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.courier}</TableCell>
                        <TableCell className="text-right">
                          <div>{row.status.replaceAll("_", " ")}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.proofStatus}
                          </div>
                        </TableCell>
                      </TableRow>
                    )) as unknown as React.ReactNode,
                  })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      ) : !loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No report data available.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
