"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PayoutPayload = {
  summary: {
    payoutCount: number;
    paidCount: number;
    totalAmount: string;
    paidAmount: string;
  };
  payouts: Array<{
    id: number;
    payoutNumber: string;
    status: string;
    payoutPercent: string;
    holdbackPercent: string;
    grossProfitAmount: string;
    holdbackAmount: string;
    payoutAmount: string;
    currency: string;
    paymentMethod: string | null;
    bankReference: string | null;
    createdAt: string;
    approvedAt: string | null;
    paidAt: string | null;
    run: {
      id: number;
      runNumber: string;
      fromDate: string;
      toDate: string;
    };
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

export default function InvestorPayoutsPage() {
  const [data, setData] = useState<PayoutPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/investor/payouts", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Failed to load payouts.");
        if (active) setData(payload as PayoutPayload);
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load payouts.");
      } finally {
        if (active) setLoading(false);
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
        <h1 className="text-2xl font-semibold">Investor Payouts</h1>
        <p className="text-sm text-muted-foreground">
          Track payout lifecycle from run creation to final settlement.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payout Count</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data?.summary.payoutCount || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid Count</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data?.summary.paidCount || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtAmount(data?.summary.totalAmount || "0")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid Amount</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{fmtAmount(data?.summary.paidAmount || "0")}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout Register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payout</TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.payouts || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.payoutNumber}</TableCell>
                      <TableCell>{item.run.runNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {fmtAmount(item.payoutAmount)} {item.currency}
                      </TableCell>
                      <TableCell>{item.paymentMethod || "-"}</TableCell>
                      <TableCell>{fmtDate(item.createdAt)}</TableCell>
                      <TableCell>{fmtDate(item.approvedAt)}</TableCell>
                      <TableCell>{fmtDate(item.paidAt)}</TableCell>
                    </TableRow>
                  ))}
                  {data?.payouts?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                        No payouts found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

