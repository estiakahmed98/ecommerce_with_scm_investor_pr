"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  Bell,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GitCompareArrows,
  PackageCheck,
  Radar,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScmActionList, type ScmActionItem } from "@/components/admin/scm/ScmActionList";
import {
  ScmEmptyState,
} from "@/components/admin/scm/ScmEmptyState";
import {
  ScmExceptionList,
  type ScmExceptionItem,
} from "@/components/admin/scm/ScmExceptionList";
import { ScmSectionHeader } from "@/components/admin/scm/ScmSectionHeader";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type DashboardOverview = {
  overview: {
    pendingApprovals: number;
    lowStockVariants: number;
    totalOrderedAmount: number;
    totalSupplierPayments: number;
    auditEvents: number;
  };
};

type NotificationsResponse = {
  unreadCount: number;
  rows: Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    href: string;
    createdAt: string;
    readAt: string | null;
  }>;
};

type MyTasksResponse = {
  summary: {
    needsMyAction: number;
    waitingOnOthers: number;
    recentlyCompleted: number;
    overdue: number;
  };
  needsMyAction: ScmActionItem[];
  waitingOnOthers: ScmActionItem[];
  recentlyCompleted: ScmActionItem[];
};

type ExceptionsResponse = {
  summary: {
    critical: number;
    needsReview: number;
    operationalRisks: number;
  };
  critical: ScmExceptionItem[];
  needsReview: ScmExceptionItem[];
  operationalRisks: ScmExceptionItem[];
};

type WorkspaceLink = {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
  permissions?: string[];
  globalPermissions?: string[];
};

const REPORT_READ_PERMISSIONS = [
  "dashboard.read",
  "purchase_requisitions.read",
  "rfq.read",
  "comparative_statements.read",
  "purchase_orders.read",
  "goods_receipts.read",
  "payment_requests.read",
  "payment_reports.read",
  "stock_reports.read",
  "supplier_performance.read",
  "supplier.feedback.manage",
  "sla.read",
  "supplier_ledger.read",
  "three_way_match.read",
] as const;

const quickStartLinks: WorkspaceLink[] = [
  {
    title: "Create Requisition",
    href: "/admin/scm/purchase-requisitions/new",
    description: "Start a new internal purchase demand.",
    icon: ClipboardList,
    permissions: ["purchase_requisitions.manage"],
  },
  {
    title: "Prepare RFQ",
    href: "/admin/scm/rfqs/new",
    description: "Launch supplier sourcing from approved demand.",
    icon: FileText,
    permissions: ["rfq.manage"],
  },
  {
    title: "Post GRN",
    href: "/admin/scm/goods-receipts/new",
    description: "Receive inbound goods and update stock.",
    icon: PackageCheck,
    permissions: ["goods_receipts.manage"],
  },
  {
    title: "Submit PRF",
    href: "/admin/scm/payment-requests/new",
    description: "Initiate supplier payment workflow.",
    icon: ClipboardCheck,
    permissions: ["payment_requests.manage"],
  },
];

const moduleDirectory: Array<{ label: string; links: WorkspaceLink[] }> = [
  {
    label: "Procurement",
    links: [
      {
        title: "Purchase Requisitions",
        href: "/admin/scm/purchase-requisitions",
        description: "Raise and route demand requests.",
        icon: ClipboardList,
        permissions: ["purchase_requisitions.read", "purchase_requisitions.manage"],
      },
      {
        title: "RFQs",
        href: "/admin/scm/rfqs",
        description: "Invite suppliers and collect quotations.",
        icon: FileText,
        permissions: ["rfq.read", "rfq.manage"],
      },
      {
        title: "Comparative Statements",
        href: "/admin/scm/comparative-statements",
        description: "Score supplier proposals and drive approvals.",
        icon: GitCompareArrows,
        permissions: [
          "comparative_statements.read",
          "comparative_statements.manage",
          "comparative_statements.approve_manager",
          "comparative_statements.approve_committee",
          "comparative_statements.approve_final",
        ],
      },
      {
        title: "Purchase Orders",
        href: "/admin/scm/purchase-orders",
        description: "Issue approved orders and track delivery.",
        icon: ShoppingCart,
        permissions: [
          "purchase_orders.read",
          "purchase_orders.manage",
          "purchase_orders.approve",
        ],
      },
    ],
  },
  {
    label: "Warehouse",
    links: [
      {
        title: "Goods Receipts",
        href: "/admin/scm/goods-receipts",
        description: "Receive stock and confirm inbound documents.",
        icon: PackageCheck,
        permissions: ["goods_receipts.read", "goods_receipts.manage"],
      },
      {
        title: "Warehouse Transfers",
        href: "/admin/scm/warehouse-transfers",
        description: "Dispatch and receive internal stock movements.",
        icon: Radar,
        permissions: [
          "warehouse_transfers.read",
          "warehouse_transfers.manage",
          "warehouse_transfers.approve",
        ],
      },
      {
        title: "Material Requests",
        href: "/admin/scm/material-requests",
        description: "Manage internal issue workflow and approvals.",
        icon: ClipboardCheck,
        permissions: [
          "material_requests.read",
          "material_requests.manage",
          "material_requests.approve_admin",
        ],
      },
      {
        title: "Stock Reports",
        href: "/admin/scm/stock-reports",
        description: "Review stock health, ageing, and summaries.",
        icon: AlertTriangle,
        permissions: ["stock_reports.read"],
      },
    ],
  },
  {
    label: "Finance & Supplier",
    links: [
      {
        title: "Payment Requests",
        href: "/admin/scm/payment-requests",
        description: "Approve and process supplier payments.",
        icon: FileText,
        permissions: [
          "payment_requests.read",
          "payment_requests.manage",
          "payment_requests.approve_admin",
          "payment_requests.approve_finance",
          "payment_requests.treasury",
        ],
      },
      {
        title: "Supplier Ledger",
        href: "/admin/scm/supplier-ledger",
        description: "Track invoice and payment exposure.",
        icon: ClipboardList,
        permissions: ["supplier_ledger.read", "supplier_invoices.read", "supplier_payments.read"],
        globalPermissions: [
          "supplier_ledger.read",
          "supplier_invoices.read",
          "supplier_payments.read",
        ],
      },
      {
        title: "3-Way Match",
        href: "/admin/scm/three-way-match",
        description: "Resolve invoice variance before payment.",
        icon: GitCompareArrows,
        permissions: ["three_way_match.read", "supplier_invoices.read", "supplier_invoices.manage"],
        globalPermissions: [
          "three_way_match.read",
          "supplier_invoices.read",
          "supplier_invoices.manage",
        ],
      },
      {
        title: "Suppliers",
        href: "/admin/scm/suppliers",
        description: "Maintain supplier master and governance.",
        icon: Bell,
        permissions: ["suppliers.read", "suppliers.manage"],
        globalPermissions: ["suppliers.read", "suppliers.manage"],
      },
    ],
  },
];

function fmtCurrency(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || fallback);
  }
  return payload as T;
}

export default function ScmHomePage() {
  const { data: session } = useSession();
  const permissionKeys = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const globalPermissionKeys = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];

  const canReadReports = REPORT_READ_PERMISSIONS.some((permission) =>
    permissionKeys.includes(permission),
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<MyTasksResponse | null>(null);
  const [exceptionsData, setExceptionsData] = useState<ExceptionsResponse | null>(null);
  const [notifications, setNotifications] = useState<NotificationsResponse | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);

  const hasAccess = permissionKeys.includes("scm.access");

  const loadWorkspace = async () => {
    if (!hasAccess) return;
    try {
      setLoading(true);
      setError(null);

      const requests: Array<Promise<any>> = [
        readJson<MyTasksResponse>(
          await fetch("/api/scm/my-tasks", { cache: "no-store" }),
          "Failed to load SCM tasks",
        ),
        readJson<ExceptionsResponse>(
          await fetch("/api/scm/exceptions", { cache: "no-store" }),
          "Failed to load SCM exceptions",
        ),
        readJson<NotificationsResponse>(
          await fetch("/api/scm/notifications?limit=6", { cache: "no-store" }),
          "Failed to load SCM notifications",
        ),
      ];

      if (canReadReports) {
        const today = new Date();
        const from = new Date(today);
        from.setDate(from.getDate() - 30);
        requests.push(
          readJson<DashboardOverview>(
            await fetch(
              `/api/scm/dashboard/overview?from=${from.toISOString().slice(0, 10)}&to=${today
                .toISOString()
                .slice(0, 10)}`,
              { cache: "no-store" },
            ),
            "Failed to load SCM overview",
          ),
        );
      }

      const [tasksData, exceptionsPayload, notificationsPayload, overviewPayload] =
        await Promise.all(requests);

      setTasks(tasksData);
      setExceptionsData(exceptionsPayload);
      setNotifications(notificationsPayload);
      setOverview(overviewPayload ?? null);
    } catch (err: any) {
      setError(err?.message || "Failed to load SCM workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [hasAccess, canReadReports]);

  const visibleQuickStart = useMemo(
    () =>
      quickStartLinks.filter((link) => {
        const hasPermission =
          !link.permissions ||
          link.permissions.some((permission) => permissionKeys.includes(permission));
        const hasGlobalPermission =
          !link.globalPermissions ||
          link.globalPermissions.some((permission) =>
            globalPermissionKeys.includes(permission),
          );
        return hasPermission && hasGlobalPermission;
      }),
    [globalPermissionKeys, permissionKeys],
  );

  const visibleDirectory = useMemo(
    () =>
      moduleDirectory
        .map((section) => ({
          ...section,
          links: section.links.filter((link) => {
            const hasPermission =
              !link.permissions ||
              link.permissions.some((permission) => permissionKeys.includes(permission));
            const hasGlobalPermission =
              !link.globalPermissions ||
              link.globalPermissions.some((permission) =>
                globalPermissionKeys.includes(permission),
              );
            return hasPermission && hasGlobalPermission;
          }),
        }))
        .filter((section) => section.links.length > 0),
    [globalPermissionKeys, permissionKeys],
  );

  if (!hasAccess) {
    return (
      <div className="p-4 md:p-6">
        <ScmEmptyState
          title="SCM workspace unavailable"
          description="Your current role does not have SCM workspace access."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  const unreadCount = notifications?.unreadCount ?? 0;
  const needsMyAction = tasks?.summary.needsMyAction ?? 0;
  const overdue = tasks?.summary.overdue ?? 0;
  const criticalExceptions = exceptionsData?.summary.critical ?? 0;
  const lowStockCount = overview?.overview.lowStockVariants ?? 0;

  return (
    <div className="space-y-8 p-4 md:p-6">
      <ScmSectionHeader
        title="SCM Workspace"
        description="Start from work queues, risks, and next actions instead of hunting across modules."
        action={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/scm/my-tasks">My Tasks</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/scm/exceptions">Exceptions</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/scm/notifications">Notifications</Link>
            </Button>
            <Button variant="outline" onClick={() => void loadWorkspace()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </>
        }
      />

      {loading ? <p className="text-sm text-muted-foreground">Loading SCM workspace...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard
          label="Needs My Action"
          value={needsMyAction}
          hint="Documents currently waiting on you."
          icon={ClipboardCheck}
          tone={needsMyAction > 0 ? "warning" : "default"}
        />
        <ScmStatCard
          label="Overdue Work"
          value={overdue}
          hint="Items stalled beyond expected response time."
          icon={AlertTriangle}
          tone={overdue > 0 ? "critical" : "default"}
        />
        <ScmStatCard
          label="Unread Notifications"
          value={unreadCount}
          hint="Internal SCM workflow updates."
          icon={Bell}
          tone={unreadCount > 0 ? "warning" : "default"}
        />
        <ScmStatCard
          label="Critical Exceptions"
          value={criticalExceptions}
          hint={canReadReports ? `${lowStockCount} low-stock variants in latest scan.` : "Risk queue needing immediate review."}
          icon={Radar}
          tone={criticalExceptions > 0 ? "critical" : "default"}
        />
      </div>

      {canReadReports && overview ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ScmStatCard
            label="Pending Approvals"
            value={overview.overview.pendingApprovals}
            hint="Current approval workload across SCM."
            icon={ClipboardList}
          />
          <ScmStatCard
            label="Ordered Value"
            value={fmtCurrency(overview.overview.totalOrderedAmount)}
            hint="PO value in the last 30 days."
            icon={ShoppingCart}
            tone="success"
          />
          <ScmStatCard
            label="Supplier Payments"
            value={fmtCurrency(overview.overview.totalSupplierPayments)}
            hint="Treasury settlements in the last 30 days."
            icon={FileText}
            tone="success"
          />
          <ScmStatCard
            label="Audit Events"
            value={overview.overview.auditEvents}
            hint="Recent SCM change footprint."
            icon={Bell}
          />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr,1fr,1fr]">
        <section className="space-y-4">
          <ScmSectionHeader
            title="My Work Today"
            description="Start from documents that require your approval, confirmation, or update."
          />
          <ScmActionList
            items={tasks?.needsMyAction.slice(0, 4) ?? []}
            empty={
              <ScmEmptyState
                title="Nothing is blocked on you"
                description="Your immediate approval and execution queue is clear."
                icon={ClipboardCheck}
              />
            }
          />
        </section>

        <section className="space-y-4">
          <ScmSectionHeader
            title="Urgent Exceptions"
            description="Focus here first when approvals, stock, matching, or delivery risk starts to slip."
          />
          <ScmExceptionList
            items={exceptionsData?.critical.slice(0, 4) ?? []}
            empty={
              <ScmEmptyState
                title="No critical exception right now"
                description="Low-stock, payment backlog, and match-variance alerts are currently under control."
                icon={AlertTriangle}
              />
            }
          />
        </section>

        <section className="space-y-4">
          <ScmSectionHeader
            title="Continue Previous Work"
            description="Documents you started are still moving through other teams or approval stages."
          />
          <ScmActionList
            items={tasks?.waitingOnOthers.slice(0, 4) ?? []}
            empty={
              <ScmEmptyState
                title="Nothing waiting on others"
                description="You do not have open SCM documents currently dependent on downstream teams."
                icon={ClipboardList}
              />
            }
          />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1.15fr]">
        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Recent Notifications</CardTitle>
              <p className="text-sm text-muted-foreground">
                The latest workflow changes reaching your internal SCM inbox.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scm/notifications">Open Inbox</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications?.rows.length ? (
              notifications.rows.map((row) => (
                <Link
                  key={`${row.type}-${row.id}`}
                  href={row.href}
                  className="block rounded-xl border border-border p-3 transition hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{row.title}</p>
                        <ScmStatusChip status={row.readAt ? "READ" : "UNREAD"} />
                      </div>
                      <p className="text-sm text-muted-foreground">{row.message}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(row.createdAt)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <ScmEmptyState
                title="No recent notifications"
                description="Workflow updates will appear here as SCM events move forward."
                icon={Bell}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <section className="space-y-4">
            <ScmSectionHeader
              title="Quick Start"
              description="Jump directly into the most common SCM actions for your role."
            />
            <div className="grid gap-4 md:grid-cols-2">
              {visibleQuickStart.map((item) => (
                <Link key={item.title} href={item.href} className="group">
                  <Card className="h-full border-border shadow-none transition group-hover:border-primary/40 group-hover:bg-primary/5">
                    <CardContent className="flex h-full items-start gap-4 p-5">
                      <div className="rounded-xl border border-border bg-background p-3">
                        <item.icon className="h-5 w-5 text-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <ScmSectionHeader
              title="Module Directory"
              description="Navigate by business area when you need full workspace access beyond the active task queue."
            />
            <div className="grid gap-4 lg:grid-cols-3">
              {visibleDirectory.map((section) => (
                <Card key={section.label} className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">{section.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {section.links.map((item) => (
                      <Link
                        key={item.title}
                        href={item.href}
                        className="block rounded-lg border border-border p-3 transition hover:bg-muted/40"
                      >
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg border border-border bg-background p-2">
                            <item.icon className="h-4 w-4 text-foreground" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
