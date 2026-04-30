"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exportInvestorStatementPdf } from "@/lib/export-investor-statement-pdf";

type StatementPayload = {
  investor: {
    id: number;
    code: string;
    name: string;
  };
  from: string;
  to: string;
  totals: {
    credit: string;
    debit: string;
    net: string;
  };
  transactions: Array<{
    id: number;
    transactionNumber: string;
    transactionDate: string;
    type: string;
    direction: string;
    amount: string;
    currency: string;
  }>;
  payouts: Array<{
    id: number;
    payoutNumber: string;
    status: string;
    payoutAmount: string;
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

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

export default function InvestorStatementsPage() {
  const defaultFrom = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return toInputDate(from);
  }, []);
  const defaultTo = useMemo(() => toInputDate(new Date()), []);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatementPayload | null>(null);

  const load = async (queryFrom: string, queryTo: string) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ from: queryFrom, to: queryTo });
      const response = await fetch(`/api/investor/statements?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to load statements.");
      setData(payload as StatementPayload);
    } catch (err: any) {
      setError(err?.message || "Failed to load statements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(defaultFrom, defaultTo);
  }, [defaultFrom, defaultTo]);

  const downloadCsv = async () => {
    try {
      setExportingCsv(true);
      const params = new URLSearchParams({ from, to, format: "csv" });
      const response = await fetch(`/api/investor/statements?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to export statement CSV.");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `investor-statement-${from}-to-${to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message || "Failed to export statement CSV.");
    } finally {
      setExportingCsv(false);
    }
  };

  const downloadPdf = async () => {
    try {
      if (!data) {
        throw new Error("Load statement data before exporting PDF.");
      }
      setExportingPdf(true);
      await exportInvestorStatementPdf({
        fileName: `investor-statement-${from}-to-${to}.pdf`,
        title: "Investor Statement",
        from: data.from,
        to: data.to,
        statements: [
          {
            investorCode: data.investor.code,
            investorName: data.investor.name,
            summary: data.totals,
            transactions: data.transactions,
            payouts: data.payouts,
          },
        ],
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to export statement PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Investor Statements</h1>
        <p className="text-sm text-muted-foreground">
          Generate account statements by date range and export CSV.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statement Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>From</Label>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => void load(from, to)}>Apply</Button>
              <Button variant="outline" onClick={() => void downloadCsv()} disabled={exportingCsv}>
                {exportingCsv ? "Exporting..." : "Export CSV"}
              </Button>
              <Button variant="outline" onClick={() => void downloadPdf()} disabled={!data || exportingPdf}>
                {exportingPdf ? "Exporting..." : "Export PDF"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Credit</p>
              <p className="text-xl font-semibold">{fmtAmount(data?.totals.credit || "0")}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Debit</p>
              <p className="text-xl font-semibold">{fmtAmount(data?.totals.debit || "0")}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Net</p>
              <p className="text-xl font-semibold">{fmtAmount(data?.totals.net || "0")}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.transactions || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.transactionNumber}</TableCell>
                      <TableCell>{fmtDate(item.transactionDate)}</TableCell>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>{item.direction}</TableCell>
                      <TableCell>
                        {fmtAmount(item.amount)} {item.currency}
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.transactions?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No transactions in selected range.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.payouts || []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.payoutNumber}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>
                      {fmtAmount(item.payoutAmount)} {item.currency}
                    </TableCell>
                    <TableCell>{fmtDate(item.createdAt)}</TableCell>
                    <TableCell>{fmtDate(item.paidAt)}</TableCell>
                  </TableRow>
                ))}
                {data?.payouts?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No payouts in selected range.
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
