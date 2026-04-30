"use client";

import { memo, useCallback, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  BellRing,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareMore,
  Package,
  PackageCheck,
  PackageSearch,
  Percent,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Target,
  Truck,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";

export type TimeRange = "today" | "week" | "month" | "year";

interface DashboardOrder {
  id: number;
  grandTotal: number;
  status: string;
  paymentStatus?: string;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
}

interface DashboardProduct {
  id: number;
  name: string;
  soldCount: number;
  ratingAvg: number;
  price: number;
  currency?: string;
  stock?: number;
}

interface MetricValue {
  label: string;
  value: number;
  tone?: "default" | "good" | "warn" | "danger";
}

interface DashboardSeriesPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface DashboardListItem {
  id: string | number;
  title: string;
  subtitle?: string;
  value?: string;
  meta?: string;
  status?: string;
  tone?: "default" | "good" | "warn" | "danger";
}

interface DashboardStats {
  totalUsers: number;
  totalOrders: number;
  totalProducts: number;
  totalRevenue: number;
  pendingOrders: number;
  lowStockProducts: number;
  recentOrders: DashboardOrder[];
  topProducts: DashboardProduct[];
  userGrowth: number;
  revenueGrowth: number;
  orderGrowth: number;
  averageOrderValue: number;
  conversionRate: number;
  successRate: number;
  paidOrders?: number;
  deliveredOrders?: number;
  activeProducts?: number;
  totalVariants?: number;
  lowStockVariants?: number;
  outOfStockVariants?: number;
  reservedStock?: number;
  refundRequests?: number;
  failedOrders?: number;
  returnedOrders?: number;
  openChats?: number;
  activeBanners?: number;
  totalBlogs?: number;
  newsletterSubscribers?: number;
  activityCount?: number;
  inventoryHealthScore?: number;
  executive?: {
    comparisonLabel?: string;
    todayGrowth?: number;
    weekGrowth?: number;
    monthGrowth?: number;
  };
  analytics?: {
    revenueSeries?: DashboardSeriesPoint[];
    ordersSeries?: DashboardSeriesPoint[];
    refundSeries?: DashboardSeriesPoint[];
    paymentBreakdown?: MetricValue[];
    orderStatusBreakdown?: MetricValue[];
    topVariants?: DashboardListItem[];
    sessions?: number;
    pageViews?: number;
  };
  inventory?: {
    totalProducts?: number;
    totalVariants?: number;
    inStockVariants?: number;
    lowStockVariants?: number;
    outOfStockVariants?: number;
    reservedUnits?: number;
    warehouseDistribution?: MetricValue[];
    recentChanges?: DashboardListItem[];
    lowStockAlerts?: DashboardListItem[];
    mostSoldVariants?: DashboardListItem[];
    healthScore?: number;
  };
  orders?: {
    pending?: number;
    processing?: number;
    shipped?: number;
    delivered?: number;
    cancelled?: number;
    failed?: number;
    returned?: number;
    paid?: number;
    unpaid?: number;
    queuedFulfillment?: number;
    courierUsage?: MetricValue[];
    refundAlerts?: DashboardListItem[];
  };
  customers?: {
    totalUsers?: number;
    newUsers?: number;
    activeBuyers?: number;
    repeatCustomers?: number;
    openCarts?: number;
    reviewAverage?: number;
    reviewCount?: number;
    topCustomers?: DashboardListItem[];
    wishlistLeaders?: DashboardListItem[];
  };
  marketing?: {
    activeBanners?: number;
    totalBlogs?: number;
    newsletters?: number;
    newsletterSubscribers?: number;
    activeCoupons?: number;
    couponHealth?: number;
    sessions?: number;
    pageViews?: number;
    topPages?: DashboardListItem[];
    trafficSources?: MetricValue[];
  };
  support?: {
    openChats?: number;
    highPriorityChats?: number;
    unreadLoad?: number;
    recentConversations?: DashboardListItem[];
    latestActivity?: DashboardListItem[];
    abnormalSignals?: DashboardListItem[];
  };
}

interface AdminDashboardViewModel {
  compareLabel: string;
  paidOrders: number;
  deliveredOrders: number;
  processingOrders: number;
  shippedOrders: number;
  cancelledOrders: number;
  unpaidOrders: number;
  activeProducts: number;
  totalVariants: number;
  lowStockVariants: number;
  outOfStockVariants: number;
  inStockVariants: number;
  reservedUnits: number;
  inventoryHealthScore: number;
  openChats: number;
  refundRequests: number;
  failedOrders: number;
  returnedOrders: number;
  activeBanners: number;
  totalBlogs: number;
  newsletterSubscribers: number;
  sessions: number;
  pageViews: number;
  revenueSeries: DashboardSeriesPoint[];
  ordersSeries: DashboardSeriesPoint[];
  refundSeries: DashboardSeriesPoint[];
  paymentBreakdown: MetricValue[];
  orderStatusBreakdown: MetricValue[];
  warehouseDistribution: MetricValue[];
  topVariantLeaders: DashboardListItem[];
  recentInventoryChanges: DashboardListItem[];
  lowStockAlerts: DashboardListItem[];
  refundAlerts: DashboardListItem[];
  topCustomers: DashboardListItem[];
  wishlistLeaders: DashboardListItem[];
  topPages: DashboardListItem[];
  trafficSources: MetricValue[];
  recentConversations: DashboardListItem[];
  latestActivity: DashboardListItem[];
  abnormalSignals: DashboardListItem[];
  activeBuyers: number;
  repeatCustomers: number;
  openCarts: number;
  reviewAverage: number;
  reviewCount: number;
}

interface AdminDashboardProps {
  stats: DashboardStats | null;
  dashboard: AdminDashboardViewModel | null;
  loading: boolean;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  onRefresh: () => void;
}

const rangeOptions = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
] as const;

const rangeTitleMap: Record<TimeRange, string> = {
  today: "Today Overview",
  week: "Weekly Performance",
  month: "Monthly Performance",
  year: "Annual Performance",
};

const compareLabelMap: Record<TimeRange, string> = {
  today: "vs yesterday",
  week: "vs last week",
  month: "vs last month",
  year: "vs last year",
};

type Tone = "default" | "good" | "warn" | "danger";

const toneClasses: Record<Tone, string> = {
  default: "border-border/70 bg-background/70 text-foreground",
  good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 [&:where(.theme-navy)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-chart-2))]",
  warn: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 [&:where(.theme-navy)]:text-[hsl(var(--analytics-chart-3))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-chart-3))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-accent))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-chart-4))]",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function formatStatusLabel(value?: string | null) {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSeries(total: number, points: number, labels: string[]) {
  const safeTotal = Math.max(0, total || 0);
  const base = safeTotal / Math.max(points, 1);
  return labels.map((label, index) => {
    const wave =
      1 + Math.sin(index * 0.9) * 0.18 + Math.cos(index * 0.35) * 0.08;
    return {
      label,
      value: Math.max(0, Math.round(base * wave)),
    };
  });
}

function getRangeLabels(timeRange: TimeRange) {
  if (timeRange === "today") return ["00", "04", "08", "12", "16", "20"];
  if (timeRange === "week")
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (timeRange === "month") return ["W1", "W2", "W3", "W4"];
  return [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
}

function MiniTrend({
  value,
  compareLabel,
}: {
  value?: number;
  compareLabel: string;
}) {
  if (typeof value !== "number") {
    return (
      <span className="text-xs text-muted-foreground">{compareLabel}</span>
    );
  }

  const positive = value >= 0;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={
          positive
            ? "text-emerald-500 dark:text-emerald-400 [&:where(.theme-navy)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-chart-2))]"
            : "text-destructive"
        }
      >
        {positive ? "+" : "-"}
      </span>
      <span className="font-medium text-foreground">
        {Math.abs(value).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">{compareLabel}</span>
    </div>
  );
}

function StatusPill({
  label,
  tone = "default",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

function SectionShell({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-border/70 bg-gradient-to-br from-card via-card to-muted/50 shadow-[0_10px_40px_rgba(0,0,0,0.06)] backdrop-blur-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4 md:px-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground md:text-lg">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

function DataBars({
  series,
  mode = "bar",
  formatter,
}: {
  series: DashboardSeriesPoint[];
  mode?: "bar" | "area";
  formatter?: (value: number) => string;
}) {
  const maxValue = Math.max(...series.map((item) => item.value), 1);

  if (mode === "area") {
    const width = 100;
    const height = 120;
    const points = series
      .map((item, index) => {
        const x =
          series.length === 1
            ? width / 2
            : (index / (series.length - 1)) * width;
        const y = height - (item.value / maxValue) * (height - 16) - 8;
        return `${x},${y}`;
      })
      .join(" ");
    const area = `0,${height} ${points} ${width},${height}`;

    return (
      <div className="space-y-4">
        <div className="h-36 rounded-[22px] border border-border/60 bg-gradient-to-b from-primary/8 via-primary/5 to-transparent p-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id="dashboard-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                <stop
                  offset="100%"
                  stopColor="currentColor"
                  stopOpacity="0.02"
                />
              </linearGradient>
            </defs>
            <polyline
              fill="url(#dashboard-area)"
              stroke="none"
              points={area}
              className="text-primary [&:where(.theme-navy)]:text-[hsl(var(--analytics-primary))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-primary))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-primary))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-primary))]"
            />
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              points={points}
              className="text-primary [&:where(.theme-navy)]:text-[hsl(var(--analytics-primary))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-primary))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-primary))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-primary))]"
            />
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {series.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-border/50 bg-muted/25 p-3"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatter ? formatter(item.value) : item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex h-44 items-end gap-2">
        {series.map((item) => {
          const height = Math.max(10, (item.value / maxValue) * 100);
          return (
            <div
              key={item.label}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-full w-full items-end rounded-[18px] border border-border/50 bg-muted/25 p-1.5">
                <div
                  className="w-full rounded-[14px] bg-gradient-to-t from-primary to-primary/55 transition-all duration-300 [&:where(.theme-navy)]:from-[hsl(var(--analytics-primary))] [&:where(.theme-navy)]:to-[hsl(var(--analytics-primary))/0.55] [&:where(.theme-plum)]:from-[hsl(var(--analytics-primary))] [&:where(.theme-plum)]:to-[hsl(var(--analytics-primary))/0.55] [&:where(.theme-olive)]:from-[hsl(var(--analytics-primary))] [&:where(.theme-olive)]:to-[hsl(var(--analytics-primary))/0.55] [&:where(.theme-rose)]:from-[hsl(var(--analytics-primary))] [&:where(.theme-rose)]:to-[hsl(var(--analytics-primary))/0.55]"
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">
                  {item.label}
                </p>
                <p className="text-xs font-medium text-foreground">
                  {formatter ? formatter(item.value) : item.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownList({
  items,
  formatter,
}: {
  items: MetricValue[];
  formatter?: (value: number) => string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const percentage =
          total > 0 ? Math.round((item.value / total) * 100) : 0;
        const barClass =
          item.tone === "good"
            ? "bg-emerald-500 [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-2))]"
            : item.tone === "warn"
              ? "bg-amber-500 [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-3))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-3))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-accent))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-4))]"
              : item.tone === "danger"
                ? "bg-destructive"
                : "bg-primary";

        return (
          <div
            key={item.label}
            className="rounded-2xl border border-border/50 bg-muted/20 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">{item.label}</span>
              <span className="font-medium text-foreground">
                {formatter ? formatter(item.value) : item.value}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full ${barClass}`}
                  style={{ width: `${clamp(percentage)}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs text-muted-foreground">
                {percentage}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InsightList({
  items,
  emptyLabel,
}: {
  items: DashboardListItem[];
  emptyLabel: string;
}) {
  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/15 p-5 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-4 rounded-2xl border border-border/50 bg-muted/20 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {item.title}
            </p>
            {item.subtitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {item.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {item.status ? (
              <StatusPill
                label={formatStatusLabel(item.status)}
                tone={item.tone}
              />
            ) : null}
            {item.meta ? (
              <span className="text-xs text-muted-foreground">{item.meta}</span>
            ) : null}
            {item.value ? (
              <span className="text-sm font-semibold text-foreground">
                {item.value}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickAction({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[22px] border border-border/70 bg-card/90 p-4 shadow-[0_8px_25px_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_14px_35px_rgba(0,0,0,0.08)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl border border-border/60 bg-muted/25 p-3">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </Link>
  );
}
function LoadingDashboard() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="h-36 rounded-[28px] border border-border/70 bg-card/80 animate-pulse" />
      <section className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-40 rounded-[24px] border border-border/70 bg-card/80 animate-pulse"
          />
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="h-[440px] rounded-[28px] border border-border/70 bg-card/80 animate-pulse" />
        <div className="h-[440px] rounded-[28px] border border-border/70 bg-card/80 animate-pulse" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-[340px] rounded-[28px] border border-border/70 bg-card/80 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

function EmptyDashboard({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-[28px] border border-border/70 bg-card/95 p-8 text-center shadow-[0_16px_50px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/30">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">
          Dashboard data is unavailable
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The admin overview could not be loaded. Refresh and verify that the
          dashboard API is returning operational metrics for your commerce
          workspace.
        </p>
        <button
          onClick={onRefresh}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Reload dashboard
        </button>
      </div>
    </div>
  );
}

function AdminDashboard({
  stats,
  dashboard,
  loading,
  timeRange,
  onTimeRangeChange,
  onRefresh,
}: AdminDashboardProps) {
  const [primaryChart, setPrimaryChart] = useState<
    "revenue" | "orders" | "refunds"
  >("revenue");

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-BD", {
      style: "currency",
      currency: "BDT",
      maximumFractionDigits: 0,
    }).format(amount || 0);
  }, []);

  const formatNumber = useCallback((amount: number) => {
    return new Intl.NumberFormat("en-US").format(amount || 0);
  }, []);

  if (loading && !stats) return <LoadingDashboard />;
  if (!stats || !dashboard) return <EmptyDashboard onRefresh={onRefresh} />;

  const primarySeries =
    primaryChart === "revenue"
      ? dashboard.revenueSeries
      : primaryChart === "orders"
        ? dashboard.ordersSeries
        : dashboard.refundSeries;

  const alertItems = [
    {
      label: `${dashboard.lowStockVariants} low-stock variants`,
      tone:
        dashboard.lowStockVariants > 0 ? ("warn" as Tone) : ("good" as Tone),
      detail: "Requires replenishment attention",
    },
    {
      label: `${stats.pendingOrders} orders awaiting action`,
      tone: stats.pendingOrders > 0 ? ("warn" as Tone) : ("good" as Tone),
      detail: "Fulfillment queue health",
    },
    {
      label: `${dashboard.refundRequests} refund requests`,
      tone:
        dashboard.refundRequests > 0 ? ("danger" as Tone) : ("good" as Tone),
      detail: "Payment recovery and exception handling",
    },
  ];

  const quickActions = [
    {
      href: "/admin/operations/products",
      label: "Add product",
      description:
        "Create products, variants, pricing, and stock-ready listings.",
      icon: Package,
    },
    {
      href: "/admin/operations/orders",
      label: "View pending orders",
      description:
        "Jump into fulfillment, payment exceptions, and shipping blockers.",
      icon: ShoppingCart,
    },
    {
      href: "/admin/warehouse/stock",
      label: "Check low stock",
      description:
        "Review variant inventory, reservations, and warehouse coverage.",
      icon: PackageSearch,
    },
    {
      href: "/admin/management/coupons",
      label: "Create coupon",
      description: "Launch targeted discounts and monitor redemption quality.",
      icon: Percent,
    },
    {
      href: "/admin/banners",
      label: "Add banner",
      description:
        "Update storefront campaigns, hero promos, and merchandising slots.",
      icon: Sparkles,
    },
    {
      href: "/admin/chat",
      label: "Open chat inbox",
      description:
        "Work the support queue, priority conversations, and escalations.",
      icon: MessageSquareMore,
    },
    {
      href: "/admin/refunds",
      label: "Review refunds",
      description: "Resolve refund requests and reconcile payment outcomes.",
      icon: WalletCards,
    },
    {
      href: "/admin/operations/users",
      label: "Manage users",
      description:
        "Inspect customers, staff roles, permissions, and account health.",
      icon: Users,
    },
  ];
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {rangeTitleMap[timeRange]}
        </h1>
        <div className="inline-flex rounded-2xl border border-border/70 bg-background/75 p-1 shadow-sm">
          {rangeOptions.map((range) => (
            <button
              key={range.value}
              onClick={() => onTimeRangeChange(range.value)}
              className={`rounded-xl px-3 py-2 text-sm transition hover:bg-primary/50 hover:text-primary-foreground ${timeRange === range.value ? "bg-primary/80 text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {range.label}
            </button>
          ))}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-background/75 hover:bg-primary/80 hover:text-primary-foreground px-4 py-2 text-sm font-medium text-foreground shadow-sm transition disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <section className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Net Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={CircleDollarSign}
          trend={stats.revenueGrowth}
          compareLabel={dashboard.compareLabel}
          tone="good"
        />
        <StatCard
          label="Total Orders"
          value={formatNumber(stats.totalOrders)}
          icon={ShoppingCart}
          trend={stats.orderGrowth}
          compareLabel={dashboard.compareLabel}
        />
        <StatCard
          label="Pending Orders"
          value={formatNumber(stats.pendingOrders)}
          icon={ReceiptText}
          compareLabel={dashboard.compareLabel}
          hint="Operational queue"
          tone={stats.pendingOrders > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Paid Orders"
          value={formatNumber(dashboard.paidOrders)}
          icon={CreditCard}
          compareLabel={dashboard.compareLabel}
          hint="Payment-cleared volume"
          tone="good"
        />
        <StatCard
          label="Active Products"
          value={formatNumber(dashboard.activeProducts)}
          icon={Store}
          compareLabel={dashboard.compareLabel}
          hint={`${dashboard.totalVariants} sellable variants`}
        />
        <StatCard
          label="Support Load"
          value={formatNumber(dashboard.openChats)}
          icon={MessageSquareMore}
          compareLabel={dashboard.compareLabel}
          hint={`${dashboard.refundRequests} refund requests`}
          tone={dashboard.openChats > 0 ? "warn" : "default"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <SectionShell
          title="Business Overview"
          subtitle="Track your revenue, orders, and performance trends"
          action={
            <div className="inline-flex rounded-2xl border border-border/70 bg-primary/10 p-1">
              {[
                { key: "revenue", label: "Revenue" },
                { key: "orders", label: "Orders" },
                { key: "refunds", label: "Refunds" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() =>
                    setPrimaryChart(
                      item.key as "revenue" | "orders" | "refunds",
                    )
                  }
                  className={`rounded-xl px-3 py-1.5 text-sm transition ${primaryChart === item.key ? "bg-primary/80 text-primary-foreground foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <DataBars
                series={primarySeries}
                mode="area"
                formatter={(value) =>
                  primaryChart === "revenue"
                    ? formatCurrency(value)
                    : formatNumber(value)
                }
              />
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BadgeDollarSign className="h-4 w-4" />
                    Net revenue
                  </div>
                  <p className="mt-2 text-xl font-semibold text-foreground">
                    {formatCurrency(stats.totalRevenue)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4" />
                    Conversion
                  </div>
                  <p className="mt-2 text-xl font-semibold text-foreground">
                    {stats.conversionRate.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <PackageCheck className="h-4 w-4" />
                    Delivered
                  </div>
                  <p className="mt-2 text-xl font-semibold text-foreground">
                    {formatNumber(dashboard.deliveredOrders)}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Payment Status Mix
                  </h3>
                </div>
                <BreakdownList
                  items={dashboard.paymentBreakdown}
                  formatter={formatNumber}
                />
              </div>
              {/* <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Order Status Mix
                  </h3>
                </div>
                <BreakdownList
                  items={dashboard.orderStatusBreakdown}
                  formatter={formatNumber}
                />
              </div> */}
            </div>
          </div>
        </SectionShell>

        <SectionShell
          title="Operations Health"
          subtitle="Monitor orders, inventory, and urgent actions needed"
        >
          <div className="space-y-4">
            <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Fulfillment success
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {stats.successRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  className="h-2.5 rounded-full bg-emerald-500 [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-2))]"
                  style={{ width: `${clamp(stats.successRate)}%` }}
                />
              </div>
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Inventory health
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {dashboard.inventoryHealthScore.toFixed(0)}/100
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  className={`h-2.5 rounded-full ${dashboard.inventoryHealthScore >= 80 ? "bg-emerald-500 [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-2))]" : dashboard.inventoryHealthScore >= 60 ? "bg-amber-500 [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-3))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-3))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-accent))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-4))]" : "bg-destructive"}`}
                  style={{ width: `${clamp(dashboard.inventoryHealthScore)}%` }}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Low-stock variants",
                  value: dashboard.lowStockVariants,
                  icon: AlertTriangle,
                  tone: "warn" as Tone,
                },
                {
                  label: "Reserved units",
                  value: dashboard.reservedUnits,
                  icon: Boxes,
                },
                {
                  label: "Open chats",
                  value: dashboard.openChats,
                  icon: MessageSquareMore,
                  tone:
                    dashboard.openChats > 0
                      ? ("warn" as Tone)
                      : ("default" as Tone),
                },
                {
                  label: "Refund queue",
                  value: dashboard.refundRequests,
                  icon: WalletCards,
                  tone:
                    dashboard.refundRequests > 0
                      ? ("danger" as Tone)
                      : ("good" as Tone),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-border/60 bg-background/80 p-4"
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xl font-semibold text-foreground">
                      {formatNumber(item.value)}
                    </p>
                    {item.tone ? (
                      <StatusPill label="Live" tone={item.tone} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Todays operational alerts
                </h3>
                <BellRing className="h-4 w-4 text-muted-foreground" />
              </div>
              <InsightList
                items={dashboard.abnormalSignals}
                emptyLabel="No abnormal signals detected in the selected time range."
              />
            </div>
          </div>
        </SectionShell>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionShell
          title="Order Management"
          subtitle="Order pipeline, payments, shipping, and refunds"
          action={
            <Link
              href="/admin/operations/orders"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Open orders
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          }
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Pending",
                  value: stats.pendingOrders,
                  tone: "warn" as Tone,
                },
                { label: "Processing", value: dashboard.processingOrders },
                { label: "Shipped", value: dashboard.shippedOrders },
                {
                  label: "Delivered",
                  value: dashboard.deliveredOrders,
                  tone: "good" as Tone,
                },
                {
                  label: "Cancelled",
                  value: dashboard.cancelledOrders,
                  tone: "danger" as Tone,
                },
                {
                  label: "Unpaid",
                  value: dashboard.unpaidOrders,
                  tone: "warn" as Tone,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-border/60 bg-muted/20 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {item.label}
                    </span>
                    {item.tone ? (
                      <StatusPill label="Live" tone={item.tone} />
                    ) : null}
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {formatNumber(item.value)}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Latest orders
                </h3>
              </div>
              <InsightList
                items={stats.recentOrders.map((order) => ({
                  id: order.id,
                  title: `Order #${order.id}`,
                  subtitle: order.user?.name || "Guest customer",
                  status: order.status,
                  tone:
                    order.status === "DELIVERED"
                      ? "good"
                      : order.status === "PENDING"
                        ? "warn"
                        : order.status === "CANCELLED"
                          ? "danger"
                          : "default",
                  value: formatCurrency(order.grandTotal),
                }))}
                emptyLabel="No recent orders available."
              />
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Refund request alerts
                </h3>
              </div>
              <InsightList
                items={dashboard.refundAlerts}
                emptyLabel="Refund queue is clear."
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          title="Inventory Status"
          subtitle="Stock levels, warehouse distribution, and low-stock alerts"
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Catalog
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(stats.totalProducts)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(dashboard.totalVariants)} tracked variants
                </p>
              </div>
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Reservations
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(dashboard.reservedUnits)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Units held by pending orders and reservations
                </p>
              </div>
            </div>
            <BreakdownList
              items={[
                {
                  label: "In stock",
                  value: dashboard.inStockVariants,
                  tone: "good",
                },
                {
                  label: "Low stock",
                  value: dashboard.lowStockVariants,
                  tone: "warn",
                },
                {
                  label: "Out of stock",
                  value: dashboard.outOfStockVariants,
                  tone: "danger",
                },
              ]}
              formatter={formatNumber}
            />
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Warehouse stock distribution
                </h3>
              </div>
              <BreakdownList
                items={dashboard.warehouseDistribution}
                formatter={formatNumber}
              />
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Low-stock spotlight
                </h3>
              </div>
              <InsightList
                items={dashboard.lowStockAlerts}
                emptyLabel="No low-stock variants require intervention."
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          title="Quick Actions"
          subtitle="High-frequency control paths for catalog, operations, marketing, support, and access control."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-1">
            {quickActions.map((action) => (
              <QuickAction key={action.label} {...action} />
            ))}
          </div>
        </SectionShell>
      </div>

      <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-[1.05fr_1.05fr_0.9fr]">
        <SectionShell
          title="Customer Insights"
          subtitle="User growth, buying behavior, and satisfaction metrics"
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Total users", value: stats.totalUsers, icon: Users },
                {
                  label: "Active buyers",
                  value: dashboard.activeBuyers,
                  icon: UserRound,
                },
                {
                  label: "Repeat customers",
                  value: dashboard.repeatCustomers,
                  icon: CheckCircle2,
                },
                {
                  label: "Open carts",
                  value: dashboard.openCarts,
                  icon: ShoppingCart,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-border/60 bg-muted/20 p-4"
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {formatNumber(item.value)}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
                <p className="text-sm text-muted-foreground">Review average</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {dashboard.reviewAverage.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(dashboard.reviewCount)} review signals
                </p>
              </div>
              <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
                <p className="text-sm text-muted-foreground">
                  Customer conversion
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {stats.conversionRate.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  Orders relative to user growth in range
                </p>
              </div>
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Top customers by spend
                </h3>
              </div>
              <InsightList
                items={dashboard.topCustomers}
                emptyLabel="No top customer data yet."
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          title="Marketing Performance"
          subtitle="Campaigns, content, traffic, and storefront engagement"
        >
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Active banners</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(dashboard.activeBanners)}
                </p>
              </div>
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">
                  Newsletter subscribers
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(dashboard.newsletterSubscribers)}
                </p>
              </div>
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">Blogs published</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(dashboard.totalBlogs)}
                </p>
              </div>
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground">
                  Page views / sessions
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(dashboard.pageViews)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(dashboard.sessions)} sessions
                </p>
              </div>
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Traffic source summary
                </h3>
              </div>
              <BreakdownList
                items={dashboard.trafficSources}
                formatter={formatNumber}
              />
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Top traffic pages
                </h3>
              </div>
              <InsightList
                items={dashboard.topPages}
                emptyLabel="No traffic pages captured yet."
              />
            </div>
          </div>
        </SectionShell>

        <SectionShell
          title="Support & Activity"
          subtitle="Customer service workload and system monitoring"
        >
          <div className="space-y-5">
            <div className="grid gap-3">
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LifeBuoy className="h-4 w-4" />
                  Open chats
                </div>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(dashboard.openChats)}
                </p>
              </div>
              <div className="rounded-[22px] border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Latest system activity
                </div>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {formatNumber(
                    stats.activityCount ?? dashboard.latestActivity.length,
                  )}
                </p>
              </div>
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquareMore className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Recently active conversations
                </h3>
              </div>
              <InsightList
                items={dashboard.recentConversations}
                emptyLabel="No active support conversations."
              />
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  System activity timeline
                </h3>
              </div>
              <InsightList
                items={dashboard.latestActivity}
                emptyLabel="No recent activity captured."
              />
            </div>
          </div>
        </SectionShell>
      </div>
      <div className="grid gap-6 lg:grid-cols-1 xl:grid-cols-[1.15fr_1fr]">
        <SectionShell
          title="Top Products"
          subtitle="Best-selling items and variant performance"
          action={
            <Link
              href="/admin/operations/products"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Manage catalog
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Top products
                  </h3>
                </div>
                <InsightList
                  items={stats.topProducts.map((product) => ({
                    id: product.id,
                    title: product.name,
                    subtitle: `${formatNumber(product.soldCount)} sold ${product.ratingAvg.toFixed(1)} rating`,
                    value: formatCurrency(product.price),
                  }))}
                  emptyLabel="No product performance data yet."
                />
              </div>
              <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Variant leaders
                  </h3>
                </div>
                <InsightList
                  items={dashboard.topVariantLeaders}
                  emptyLabel="No variant sales momentum available."
                />
              </div>
            </div>
            <DataBars
              series={dashboard.ordersSeries}
              formatter={(value) => formatNumber(value)}
            />
          </div>
        </SectionShell>

        <SectionShell
          title="Inventory Trends"
          subtitle="Stock movements and customer demand signals"
        >
          <div className="space-y-5">
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <PackageSearch className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Recent inventory changes
                </h3>
              </div>
              <InsightList
                items={dashboard.recentInventoryChanges}
                emptyLabel="No inventory movement captured."
              />
            </div>
            <div className="rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  Most wishlisted products
                </h3>
              </div>
              <InsightList
                items={dashboard.wishlistLeaders}
                emptyLabel="No wishlist demand signals available."
              />
            </div>
          </div>
        </SectionShell>
      </div>
    </div>
  );
}

const MemoizedAdminDashboard = memo(AdminDashboard);

export default MemoizedAdminDashboard;
export type {
  DashboardStats,
  DashboardOrder,
  DashboardProduct,
  AdminDashboardViewModel,
};
