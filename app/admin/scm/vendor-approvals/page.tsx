"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RequestRow = {
  id: number;
  requestType: "PROFILE_UPDATE" | "DOCUMENT_UPDATE" | "ANNUAL_RENEWAL";
  status: "PENDING" | "APPROVED" | "REJECTED";
  payload: unknown;
  note: string | null;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: number; code: string; name: string; email: string | null };
  requestedBy: { id: string; name: string | null; email: string | null };
  reviewedBy: { id: string; name: string | null; email: string | null } | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function VendorApprovalsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      const response = await fetch(
        `/api/scm/supplier-profile-requests${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load vendor approvals.");
      }
      setRows(Array.isArray(payload) ? (payload as RequestRow[]) : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load vendor approvals.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, status]);

  const review = async (id: number, decision: "APPROVE" | "REJECT") => {
    try {
      setSavingId(id);
      const response = await fetch("/api/scm/supplier-profile-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          decision,
          reviewNote: reviewNotes[id] || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to review request.");
      }
      toast.success(decision === "APPROVE" ? "Request approved." : "Request rejected.");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to review request.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Vendor Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review supplier profile/document requests and apply governance decisions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Search</Label>
              <Input
                placeholder="Supplier / requester..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests found.</p>
          ) : (
            <div className="space-y-4">
              {rows.map((row) => (
                <div key={row.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        #{row.id} | {row.requestType} | {row.supplier.name} ({row.supplier.code})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested by {row.requestedBy.name || "N/A"} ({row.requestedBy.email || "No email"}) at{" "}
                        {fmtDate(row.requestedAt)}
                      </p>
                    </div>
                    <Badge variant={row.status === "PENDING" ? "default" : "outline"}>
                      {row.status}
                    </Badge>
                  </div>

                  {row.note ? <p className="mt-2 text-sm">Request note: {row.note}</p> : null}

                  <details className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">
                    <summary className="cursor-pointer font-medium">View payload snapshot</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words">
                      {JSON.stringify(row.payload, null, 2)}
                    </pre>
                  </details>

                  {row.status === "PENDING" ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder="Review note"
                        value={reviewNotes[row.id] || ""}
                        onChange={(event) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [row.id]: event.target.value,
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => void review(row.id, "APPROVE")}
                          disabled={savingId === row.id}
                        >
                          {savingId === row.id ? "Saving..." : "Approve"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void review(row.id, "REJECT")}
                          disabled={savingId === row.id}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reviewed: {fmtDate(row.reviewedAt)} by {row.reviewedBy?.email || "N/A"}
                      {row.reviewNote ? ` | Note: ${row.reviewNote}` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
