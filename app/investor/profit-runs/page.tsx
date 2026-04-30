"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ProfitPayload = {
  runs: Array<{
    id: number;
    runNumber: string;
    status: string;
    fromDate: string;
    toDate: string;
    totalNetProfit: string;
    totalNetRevenue: string;
    totalNetCogs: string;
    totalOperatingExpense: string;
    postedAt: string | null;
  }>;
  selectedRunId: number | null;
  allocationLines: Array<{
    id: number;
    participationSharePct: string;
    allocatedRevenue: string;
    allocatedNetProfit: string;
    productVariant: {
      id: number;
      sku: string;
      product: { id: number; name: string };
    };
  }>;
  payouts: Array<{
    id: number;
    payoutNumber: string;
    status: string;
    payoutAmount: string;
    payoutPercent: string;
    holdbackPercent: string;
    currency: string;
    createdAt: string;
    paidAt: string | null;
  }>;
};

function fmtAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

export default function InvestorProfitRunsPage() {
  const [runId, setRunId] = useState<number | null>(null);
  const [data, setData] = useState<ProfitPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (runId) params.set("runId", String(runId));
        const response = await fetch(`/api/investor/profit-runs?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Failed to load profit runs.");
        const parsed = payload as ProfitPayload;
        if (active) {
          setData(parsed);
          if (!runId && parsed.selectedRunId) {
            setRunId(parsed.selectedRunId);
          }
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || "Failed to load profit runs.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [runId]);

  const selectedRun = useMemo(
    () => (data?.runs || []).find((item) => item.id === runId) || null,
    [data, runId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Investor Profit Runs</h1>
        <p className="text-sm text-muted-foreground">
          Product-wise profit distribution and payout outcomes for your account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md space-y-1">
            <Label>Profit Run</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={runId ?? ""}
              onChange={(event) => setRunId(Number(event.target.value) || null)}
            >
              <option value="">Select run</option>
              {(data?.runs || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.runNumber} ({item.status})
                </option>
              ))}
            </select>
          </div>

          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!loading && !error && selectedRun ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Run</p>
                <p className="font-medium">{selectedRun.runNumber}</p>
                <Badge className="mt-2" variant="outline">
                  {selectedRun.status}
                </Badge>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="font-medium">
                  {fmtDate(selectedRun.fromDate)} to {fmtDate(selectedRun.toDate)}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total Net Profit</p>
                <p className="text-lg font-semibold">{fmtAmount(selectedRun.totalNetProfit)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Posted At</p>
                <p className="font-medium">{fmtDate(selectedRun.postedAt)}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocation Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Share %</TableHead>
                  <TableHead>Allocated Revenue</TableHead>
                  <TableHead>Allocated Net Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.allocationLines || []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.productVariant.product.name} ({item.productVariant.sku})
                    </TableCell>
                    <TableCell>{fmtAmount(item.participationSharePct)}%</TableCell>
                    <TableCell>{fmtAmount(item.allocatedRevenue)}</TableCell>
                    <TableCell>{fmtAmount(item.allocatedNetProfit)}</TableCell>
                  </TableRow>
                ))}
                {data?.allocationLines?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No allocation lines for selected run.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payout %</TableHead>
                  <TableHead>Holdback %</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.payouts || []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.payoutNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {fmtAmount(item.payoutAmount)} {item.currency}
                    </TableCell>
                    <TableCell>{fmtAmount(item.payoutPercent)}%</TableCell>
                    <TableCell>{fmtAmount(item.holdbackPercent)}%</TableCell>
                    <TableCell>{fmtDate(item.createdAt)}</TableCell>
                    <TableCell>{fmtDate(item.paidAt)}</TableCell>
                  </TableRow>
                ))}
                {data?.payouts?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No payouts for selected run.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

