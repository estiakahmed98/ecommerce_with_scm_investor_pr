"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type OverviewPayload = {
  investor: {
    id: number;
    code: string;
    name: string;
  };
  summary: {
    totalCredit: string;
    totalDebit: string;
    balance: string;
    allocationCount: number;
    activeAllocationCount: number;
    recentPayoutTotal: string;
    unreadNotificationCount: number;
    pendingProfileRequestCount: number;
  };
  recentTransactions: Array<{
    id: number;
    transactionNumber: string;
    transactionDate: string;
    type: string;
    direction: string;
    amount: string;
    currency: string;
  }>;
  recentPayouts: Array<{
    id: number;
    payoutNumber: string;
    status: string;
    payoutAmount: string;
    currency: string;
    createdAt: string;
    paidAt: string | null;
    run: { id: number; runNumber: string };
  }>;
  recentRuns: Array<{
    id: number;
    runNumber: string;
    status: string;
    fromDate: string;
    toDate: string;
    totalNetProfit: string;
    createdAt: string;
  }>;
};

function fmtAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function InvestorDashboardPage() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/investor/overview", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load investor overview.");
        }
        if (active) {
          setData(payload as OverviewPayload);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || "Failed to load investor overview.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Investor Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Monitor your portfolio snapshots, ledger balance, and payout timeline.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading overview...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Credit</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{fmtAmount(data.summary.totalCredit)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Debit</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{fmtAmount(data.summary.totalDebit)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Balance</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{fmtAmount(data.summary.balance)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Allocations</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.summary.activeAllocationCount}/{data.summary.allocationCount}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unread Notifications</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.summary.unreadNotificationCount}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Profile Requests</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.summary.pendingProfileRequestCount}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions found.</p>
                ) : (
                  data.recentTransactions.map((item) => (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{item.transactionNumber}</p>
                        <Badge variant="outline">{item.direction}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.type} • {fmtAmount(item.amount)} {item.currency}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmtDate(item.transactionDate)}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Payouts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentPayouts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payouts found.</p>
                ) : (
                  data.recentPayouts.map((item) => (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{item.payoutNumber}</p>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtAmount(item.payoutAmount)} {item.currency}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.run.runNumber} • {fmtDate(item.paidAt || item.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Profit Runs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No profit runs found.</p>
                ) : (
                  data.recentRuns.map((item) => (
                    <div key={item.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{item.runNumber}</p>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Net Profit: {fmtAmount(item.totalNetProfit)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(item.fromDate)} to {fmtDate(item.toDate)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
