"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

type LedgerPayload = {
  totals: {
    credit: string;
    debit: string;
    balance: string;
  };
  transactions: Array<{
    id: number;
    transactionNumber: string;
    transactionDate: string;
    type: string;
    direction: string;
    amount: string;
    currency: string;
    note: string | null;
    productVariant: {
      id: number;
      sku: string;
      product: { id: number; name: string };
    } | null;
  }>;
};

function fmtAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InvestorLedgerPage() {
  const [data, setData] = useState<LedgerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (typeFilter.trim()) params.set("type", typeFilter.trim().toUpperCase());
        const response = await fetch(`/api/investor/ledger?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Failed to load ledger.");
        if (active) setData(payload as LedgerPayload);
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load ledger.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [typeFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Investor Ledger</h1>
        <p className="text-sm text-muted-foreground">Review your posted capital ledger entries.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ledger Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Credit</p>
            <p className="text-xl font-semibold">{fmtAmount(data?.totals.credit || "0")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Debit</p>
            <p className="text-xl font-semibold">{fmtAmount(data?.totals.debit || "0")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-xl font-semibold">{fmtAmount(data?.totals.balance || "0")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Filter by type (e.g. DISTRIBUTION)"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="max-w-sm"
          />

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
                    <TableHead>Product</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.transactions || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.transactionNumber}</TableCell>
                      <TableCell>{new Date(item.transactionDate).toLocaleString()}</TableCell>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>{item.direction}</TableCell>
                      <TableCell>{fmtAmount(item.amount)} {item.currency}</TableCell>
                      <TableCell>
                        {item.productVariant
                          ? `${item.productVariant.product.name} (${item.productVariant.sku})`
                          : "-"}
                      </TableCell>
                      <TableCell>{item.note || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
