"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RunRow = {
  id: number;
  runNumber: string;
  fromDate: string;
  toDate: string;
  status: string;
  postedAt: string | null;
  totalNetRevenue: string;
  totalNetProfit: string;
  retainedVariantCount: number;
  retainedShareTotal: string;
  retainedRevenue: string;
  retainedProfit: string;
};

type SelectedRun = {
  id: number;
  runNumber: string;
  fromDate: string;
  toDate: string;
  status: string;
  postedAt: string | null;
  totalNetRevenue: string;
  totalNetProfit: string;
  retainedLines: Array<{
    id: number;
    sku: string;
    productName: string;
    netRevenue: string;
    netProfit: string;
    retainedSharePct: string;
    retainedRevenue: string;
    retainedProfit: string;
  }>;
};

type Payload = {
  filters: {
    from: string;
    to: string;
    status: string;
  };
  summary: {
    totalRuns: number;
    runsWithRetainedProfit: number;
    retainedVariantCount: number;
    totalRetainedRevenue: string;
    totalRetainedProfit: string;
  };
  runs: RunRow[];
  selectedRunId: number | null;
  selectedRun: SelectedRun | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function fmtMoney(value: string) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function InvestorRetainedProfitPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthStart = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
  }, []);

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("POSTED");
  const [selectedRunId, setSelectedRunId] = useState<number | "">("");

  const load = async (options?: { runId?: number | "" }) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (status) params.set("status", status);
      const nextRunId = options?.runId ?? selectedRunId;
      if (nextRunId) params.set("runId", String(nextRunId));

      const response = await fetch(
        `/api/admin/investor-retained-profit?${params.toString()}`,
        { cache: "no-store" },
      );
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to load retained profit report.");
      }
      const data = next as Payload;
      setPayload(data);
      setSelectedRunId(data.selectedRunId ?? "");
    } catch (error: any) {
      toast.error(error?.message || "Failed to load retained profit report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const applyFilters = async () => {
    await load({ runId: "" });
  };

  const openRun = async (runId: number) => {
    setSelectedRunId(runId);
    await load({ runId });
  };

  if (loading && !payload) {
    return <div className="p-6 text-sm text-muted-foreground">Loading retained profit report...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Company Retained Profit</h1>
          <p className="text-sm text-muted-foreground">
            Company-side view of profit left outside investor allocation. This amount is not posted to investor ledger or payouts.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/investors/profit-runs">Open Profit Runs</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              className="h-10 min-w-[180px] rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="POSTED">POSTED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
              <option value="">ALL</option>
            </select>
          </div>
          <Button onClick={() => void applyFilters()} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Runs In Scope</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{payload?.summary.totalRuns ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Runs With Retained Profit</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{payload?.summary.runsWithRetainedProfit ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Retained Variants</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{payload?.summary.retainedVariantCount ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Retained Revenue</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(payload?.summary.totalRetainedRevenue || "0")}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Retained Profit</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(payload?.summary.totalRetainedProfit || "0")}</CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run Register</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payload?.runs.length ? (
              payload.runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => void openRun(run.id)}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    payload.selectedRunId === run.id
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium">{run.runNumber}</div>
                      <div className="text-sm text-muted-foreground">
                        {fmtDate(run.fromDate)} - {fmtDate(run.toDate)} | {run.status}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Posted: {fmtDate(run.postedAt)}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Variants</div>
                      <div className="mt-1 font-medium">{run.retainedVariantCount}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Retained Share Total</div>
                      <div className="mt-1 font-medium">{(Number(run.retainedShareTotal) * 100).toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Retained Revenue</div>
                      <div className="mt-1 font-medium">{fmtMoney(run.retainedRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Retained Profit</div>
                      <div className="mt-1 font-medium">{fmtMoney(run.retainedProfit)}</div>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No retained profit runs found for current filter.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selected Run Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payload?.selectedRun ? (
              <>
                <div className="rounded-lg border p-4 text-sm">
                  <div className="font-medium">{payload.selectedRun.runNumber}</div>
                  <div className="mt-1 text-muted-foreground">
                    {fmtDate(payload.selectedRun.fromDate)} - {fmtDate(payload.selectedRun.toDate)} | {payload.selectedRun.status}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Run Revenue</div>
                      <div className="mt-1 font-medium">{fmtMoney(payload.selectedRun.totalNetRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Run Profit</div>
                      <div className="mt-1 font-medium">{fmtMoney(payload.selectedRun.totalNetProfit)}</div>
                    </div>
                  </div>
                </div>

                {payload.selectedRun.retainedLines.length > 0 ? (
                  payload.selectedRun.retainedLines.map((line) => (
                    <div key={line.id} className="rounded-lg border p-4 text-sm">
                      <div className="font-medium">
                        {line.productName} ({line.sku})
                      </div>
                      <div className="mt-2 grid gap-3 md:grid-cols-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Company Share</div>
                          <div className="mt-1 font-medium">{(Number(line.retainedSharePct) * 100).toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Retained Revenue</div>
                          <div className="mt-1 font-medium">{fmtMoney(line.retainedRevenue)}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Retained Profit</div>
                          <div className="mt-1 font-medium">{fmtMoney(line.retainedProfit)}</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    This run has no company retained lines.
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Select a run to review retained profit breakdown.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
