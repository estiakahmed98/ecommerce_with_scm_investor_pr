"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestorWorkflowGuide } from "@/components/investors/InvestorWorkflowGuide";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Payload = {
  summary: {
    pending: number;
    approved: number;
    rejected: number;
  };
  rows: Array<{
    id: number;
    status: string;
    requestedChanges: Record<string, unknown>;
    requestNote: string | null;
    reviewNote: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    investor: {
      id: number;
      code: string;
      name: string;
      email: string | null;
      status: string;
      kycStatus: string;
    };
    submittedBy: { id: string; name: string | null; email: string } | null;
    reviewedBy: { id: string; name: string | null; email: string } | null;
  }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function InvestorProfileRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [workingId, setWorkingId] = useState<number | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(
        `/api/admin/investor-profile-requests${params.size ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load investor profile requests.");
      }
      setData(payload as Payload);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor profile requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const review = async (id: number, action: "approve" | "reject") => {
    try {
      setWorkingId(id);
      const response = await fetch(`/api/admin/investor-profile-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewNote: reviewNotes[id] || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to review profile request.");
      }
      toast.success(action === "approve" ? "Request approved." : "Request rejected.");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to review profile request.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <InvestorWorkflowGuide currentSection="profile-requests" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Investor Profile Requests</h1>
          <p className="text-sm text-muted-foreground">
            Review portal-submitted identity and beneficiary update requests.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search investor"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56"
          />
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.pending ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.approved ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.rejected ?? 0}</CardContent></Card>
      </div>

      <div className="flex gap-2">
        {["PENDING", "APPROVED", "REJECTED", ""].map((value) => (
          <Button
            key={value || "ALL"}
            variant={status === value ? "default" : "outline"}
            onClick={() => setStatus(value)}
          >
            {value || "ALL"}
          </Button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading requests...</p> : null}

      {!loading && data ? (
        <div className="space-y-4">
          {data.rows.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No investor profile requests found.
              </CardContent>
            </Card>
          ) : (
            data.rows.map((row) => (
              <Card key={row.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      Request #{row.id} • {row.investor.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{row.status}</span>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/investors/${row.investor.id}`}>Open Investor</Link>
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.investor.code} • Submitted {fmtDate(row.submittedAt)} • KYC {row.investor.kycStatus}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {row.requestNote ? <p className="text-sm">Request note: {row.requestNote}</p> : null}
                  <div className="rounded-md border p-3 text-sm">
                    <p className="mb-2 font-medium">Requested Changes</p>
                    <div className="space-y-1 text-muted-foreground">
                      {Object.entries(row.requestedChanges || {}).map(([key, value]) => (
                        <div key={key}>
                          {key}: {String(value ?? "") || "N/A"}
                        </div>
                      ))}
                    </div>
                  </div>
                  {row.status === "PENDING" ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label>Review Note</Label>
                        <Textarea
                          value={reviewNotes[row.id] || ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void review(row.id, "approve")}
                          disabled={workingId === row.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void review(row.id, "reject")}
                          disabled={workingId === row.id}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : row.reviewNote ? (
                    <p className="text-sm text-muted-foreground">Review note: {row.reviewNote}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
