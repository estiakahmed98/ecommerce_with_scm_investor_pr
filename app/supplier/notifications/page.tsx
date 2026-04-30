"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type NotificationsResponse = {
  unreadCount: number;
  rows: Array<{
    id: number;
    channel: string;
    status: string;
    type: string;
    title: string;
    message: string;
    metadata: unknown;
    sentAt: string | null;
    readAt: string | null;
    createdAt: string;
  }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function SupplierNotificationsPage() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/supplier/notifications", { cache: "no-store" });
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

  const markRead = async (id: number) => {
    try {
      const response = await fetch("/api/supplier/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
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
      const response = await fetch("/api/supplier/notifications", {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Monitor approval responses, expiry alerts, and payment/work-order updates.
          </p>
        </div>
        <div className="flex gap-2">
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inbox Summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              Unread notifications: <span className="font-semibold">{data.unreadCount}</span>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {data.rows.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No notifications found.
                </CardContent>
              </Card>
            ) : (
              data.rows.map((row) => (
                <Card key={row.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{row.title}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="outline">{row.type}</Badge>
                        {row.readAt ? (
                          <Badge variant="outline">READ</Badge>
                        ) : (
                          <Badge>UNREAD</Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created: {fmtDate(row.createdAt)} | Channel: {row.channel}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">{row.message}</p>
                    <p className="text-xs text-muted-foreground">
                      Sent: {fmtDate(row.sentAt)} | Read: {fmtDate(row.readAt)}
                    </p>
                    {!row.readAt ? (
                      <Button size="sm" variant="outline" onClick={() => void markRead(row.id)}>
                        Mark Read
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
