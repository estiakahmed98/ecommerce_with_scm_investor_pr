"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";

type NotificationRow = {
  id: number;
  type: string;
  stage: string;
  status: string;
  title: string;
  message: string;
  entityNumber: string;
  href: string;
  metadata: unknown;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  unreadCount: number;
  rows: NotificationRow[];
  health: {
    unreadInternalCount: number;
    modules: Array<{
      key: string;
      label: string;
      systemCount: number;
      emailPending: number;
      emailFailed: number;
      emailSent: number;
    }>;
    recentFailures: Array<{
      key: string;
      label: string;
      id: number;
      recipientEmail: string | null;
      message: string;
      createdAt: string;
      error: string | null;
    }>;
  };
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function ScmNotificationsPage() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("ALL");

  const load = async (nextUnreadOnly = unreadOnly) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: "100" });
      if (nextUnreadOnly) {
        params.set("unreadOnly", "true");
      }
      const response = await fetch(`/api/scm/notifications?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load notifications.");
      }
      setData(payload as NotificationsResponse);
    } catch (err: any) {
      setError(err?.message || "Failed to load notifications.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const markRead = async (row: NotificationRow) => {
    try {
      const response = await fetch("/api/scm/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, type: row.type }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to mark notification.");
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to mark notification.");
    }
  };

  const markAllRead = async () => {
    try {
      setMarkingAll(true);
      const response = await fetch("/api/scm/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to mark all notifications.");
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to mark all notifications.");
    } finally {
      setMarkingAll(false);
    }
  };

  const processQueue = async (action: "process_email_queue" | "retry_failed_email_queue") => {
    try {
      if (action === "process_email_queue") {
        setProcessingQueue(true);
      } else {
        setRetryingQueue(true);
      }
      const response = await fetch("/api/scm/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to process notification queue.");
      }
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to process notification queue.");
    } finally {
      if (action === "process_email_queue") {
        setProcessingQueue(false);
      } else {
        setRetryingQueue(false);
      }
    }
  };

  const moduleOptions = useMemo(() => {
    if (!data) return [];
    return data.health.modules
      .map((module) => ({
        value: module.key,
        label: module.label,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [data]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (moduleFilter !== "ALL" && row.type !== moduleFilter) return false;
      if (!query) return true;
      return (
        row.title.toLowerCase().includes(query) ||
        row.message.toLowerCase().includes(query) ||
        row.entityNumber.toLowerCase().includes(query) ||
        row.stage.toLowerCase().includes(query)
      );
    });
  }, [data, moduleFilter, search]);

  const needsActionRows = useMemo(
    () => visibleRows.filter((row) => !row.readAt),
    [visibleRows],
  );

  const recentUpdateRows = useMemo(
    () => visibleRows.filter((row) => Boolean(row.readAt)),
    [visibleRows],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">SCM Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Track internal approval workflow alerts across requisitions, CS, PO, and PRF.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const next = !unreadOnly;
              setUnreadOnly(next);
              void load(next);
            }}
          >
            {unreadOnly ? "Show All" : "Unread Only"}
          </Button>
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="outline" onClick={() => void markAllRead()} disabled={markingAll}>
            {markingAll ? "Marking..." : "Mark All Read"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void processQueue("process_email_queue")}
            disabled={processingQueue}
          >
            {processingQueue ? "Processing..." : "Process Email Queue"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void processQueue("retry_failed_email_queue")}
            disabled={retryingQueue}
          >
            {retryingQueue ? "Retrying..." : "Retry Failed Emails"}
          </Button>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading notifications...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ScmStatCard
              label="Unread"
              value={String(data.unreadCount)}
              hint="Needs your attention"
              tone={data.unreadCount > 0 ? "warning" : "default"}
            />
            <ScmStatCard
              label="Visible Rows"
              value={String(visibleRows.length)}
              hint="After local filter/search"
            />
            <ScmStatCard
              label="Failed Emails"
              value={String(data.health.recentFailures.length)}
              hint="Delivery issues in queue"
              tone={data.health.recentFailures.length > 0 ? "critical" : "default"}
            />
            <ScmStatCard
              label="Modules"
              value={String(data.health.modules.length)}
              hint="Notification-producing SCM areas"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inbox Controls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, message, entity number, stage..."
              />
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                <option value="ALL">All modules</option>
                {moduleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.health.modules.map((module) => (
              <Card key={module.key}>
                <CardHeader>
                  <CardTitle className="text-base">{module.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>System</span>
                    <span className="font-medium text-foreground">{module.systemCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Email Sent</span>
                    <span className="font-medium text-foreground">{module.emailSent}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Email Pending</span>
                    <span className="font-medium text-foreground">{module.emailPending}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Email Failed</span>
                    <span className="font-medium text-destructive">{module.emailFailed}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">System Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.health.recentFailures.length === 0 ? (
                <p className="text-sm text-muted-foreground">No failed email deliveries.</p>
              ) : (
                data.health.recentFailures.map((row) => (
                  <div key={`${row.key}-${row.id}`} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{row.label}</Badge>
                          <Badge variant="destructive">FAILED</Badge>
                        </div>
                        <p className="text-sm font-medium">{row.recipientEmail || "No email"}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(row.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{row.message}</p>
                    {row.error ? (
                      <p className="mt-1 text-xs text-destructive">Error: {row.error}</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {visibleRows.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No SCM notifications found.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Needs Action</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {needsActionRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No unread workflow alerts in the current filter.
                      </p>
                    ) : (
                      needsActionRows.map((row) => (
                        <Card key={`${row.type}-${row.id}`} className="border-amber-200 bg-amber-50/40 shadow-none">
                          <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <CardTitle className="text-base">{row.title}</CardTitle>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">{row.type}</Badge>
                                <Badge>{row.stage}</Badge>
                                <Badge variant="secondary">UNREAD</Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Entity: {row.entityNumber || "N/A"} | Created: {fmtDate(row.createdAt)}
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <p className="text-sm">{row.message}</p>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild size="sm">
                                <Link href={row.href}>Open Workflow</Link>
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void markRead(row)}>
                                Mark Read
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent Updates</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentUpdateRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No read updates in the current filter.
                      </p>
                    ) : (
                      recentUpdateRows.map((row) => (
                        <Card key={`${row.type}-${row.id}`} className="shadow-none">
                          <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <CardTitle className="text-base">{row.title}</CardTitle>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">{row.type}</Badge>
                                <Badge variant="outline">{row.stage}</Badge>
                                <Badge variant="outline">READ</Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Entity: {row.entityNumber || "N/A"} | Read: {fmtDate(row.readAt)}
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <p className="text-sm">{row.message}</p>
                            <p className="text-xs text-muted-foreground">
                              Sent: {fmtDate(row.sentAt)}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild size="sm" variant="outline">
                                <Link href={row.href}>Open Module</Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
