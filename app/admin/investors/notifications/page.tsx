"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestorWorkflowGuide } from "@/components/investors/InvestorWorkflowGuide";
import { Input } from "@/components/ui/input";

type NotificationRow = {
  id: number;
  type: string;
  title: string;
  message: string;
  status: string;
  targetUrl: string | null;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  unreadCount: number;
  rows: NotificationRow[];
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function formatType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function InvestorNotificationsPage() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async (nextUnreadOnly = unreadOnly) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: "100" });
      if (nextUnreadOnly) {
        params.set("unreadOnly", "true");
      }
      const response = await fetch(
        `/api/admin/investor-notifications?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load investor notifications.");
      }
      setData(payload as NotificationsResponse);
    } catch (err: any) {
      setError(err?.message || "Failed to load investor notifications.");
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
      const response = await fetch("/api/admin/investor-notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
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
      const response = await fetch("/api/admin/investor-notifications", {
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

  const typeOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.rows.map((row) => row.type))].sort();
  }, [data]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (typeFilter !== "ALL" && row.type !== typeFilter) return false;
      if (!query) return true;
      return (
        row.title.toLowerCase().includes(query) ||
        row.message.toLowerCase().includes(query) ||
        row.type.toLowerCase().includes(query)
      );
    });
  }, [data, search, typeFilter]);

  const unreadVisibleCount = useMemo(
    () => visibleRows.filter((row) => !row.readAt).length,
    [visibleRows],
  );

  return (
    <div className="space-y-6 p-6">
      <InvestorWorkflowGuide currentSection="notifications" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Investor Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Internal investor workflow alerts for reviewers, approvers, posters,
            and payout operators.
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
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading notifications...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Unread
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">
                {data.unreadCount}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Visible Rows
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">
                {visibleRows.length}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Needs Action
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">
                {unreadVisibleCount}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Notification Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  placeholder="Search notification"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="md:max-w-sm"
                />
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm md:w-56"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                >
                  <option value="ALL">All Types</option>
                  {typeOptions.map((value) => (
                    <option key={value} value={value}>
                      {formatType(value)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {visibleRows.length === 0 ? (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">
                    No investor notifications found.
                  </div>
                ) : (
                  visibleRows.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-lg border p-4 ${
                        row.readAt ? "bg-background" : "bg-emerald-50/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{row.title}</h3>
                            <Badge variant="outline">{formatType(row.type)}</Badge>
                            <Badge variant={row.readAt ? "secondary" : "default"}>
                              {row.readAt ? "Read" : "Unread"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{row.message}</p>
                          <p className="text-xs text-muted-foreground">
                            Created {fmtDate(row.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {row.targetUrl ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={row.targetUrl}>Open</Link>
                            </Button>
                          ) : null}
                          {!row.readAt ? (
                            <Button size="sm" onClick={() => void markRead(row)}>
                              Mark Read
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
