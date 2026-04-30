"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type SupplierPaymentsResponse = {
  summary: {
    paymentCount: number;
    settledAmount: string;
    outstandingAmount: string;
  };
  rows: Array<{
    id: number;
    paymentNumber: string;
    paymentDate: string;
    amount: string;
    method: string;
    reference: string | null;
    note: string | null;
    invoice: {
      id: number;
      invoiceNumber: string;
      total: string;
      currency: string;
      status: string;
    } | null;
  }>;
};

function fmtAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function SupplierPaymentsPage() {
  const [data, setData] = useState<SupplierPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(
        `/api/supplier/payments${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load payments.");
      }
      setData(payload as SupplierPaymentsResponse);
    } catch (err: any) {
      setError(err?.message || "Failed to load payments.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payment Status</h1>
          <p className="text-sm text-muted-foreground">
            Track payment settlements and invoice linkage from AP.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Search</Label>
          <Input
            placeholder="Payment number / invoice..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading payments...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Payment Count</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{data.summary.paymentCount}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Settled</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {fmtAmount(data.summary.settledAmount)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {fmtAmount(data.summary.outstandingAmount)}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments found.</p>
              ) : (
                <div className="space-y-3">
                  {data.rows.map((row) => (
                    <div key={row.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{row.paymentNumber}</p>
                        <p className="text-sm text-muted-foreground">{fmtDate(row.paymentDate)}</p>
                      </div>
                      <p className="text-sm">
                        Amount: <span className="font-medium">{fmtAmount(row.amount)}</span> | Method:{" "}
                        {row.method}
                      </p>
                      {row.invoice ? (
                        <p className="text-xs text-muted-foreground">
                          Invoice: {row.invoice.invoiceNumber} ({row.invoice.status})
                        </p>
                      ) : null}
                      {row.reference ? (
                        <p className="text-xs text-muted-foreground">Reference: {row.reference}</p>
                      ) : null}
                      {row.note ? <p className="mt-1 text-xs text-muted-foreground">{row.note}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
