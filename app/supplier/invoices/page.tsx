"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InvoiceResponse = {
  summary: {
    count: number;
    invoiceTotal: string;
    settledTotal: string;
    outstandingTotal: string;
  };
  rows: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    matchStatus: string;
    issueDate: string;
    dueDate: string | null;
    postedAt: string;
    currency: string;
    subtotal: string;
    taxTotal: string;
    otherCharges: string;
    total: string;
    paymentHoldStatus: string;
    paymentHoldReason: string | null;
    slaCreditStatus: string;
    slaRecommendedCredit: string;
    note: string | null;
    settledAmount: string;
    outstandingAmount: string;
    purchaseOrder: {
      id: number;
      poNumber: string;
      status: string;
    } | null;
    payments: Array<{
      id: number;
      paymentNumber: string;
      paymentDate: string;
      amount: string;
      method: string;
      reference: string | null;
    }>;
  }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function fmtAmount(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SupplierInvoicesPage() {
  const [data, setData] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      const response = await fetch(
        `/api/supplier/invoices${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load invoices.");
      }
      setData(payload as InvoiceResponse);
    } catch (err: any) {
      setError(err?.message || "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invoices & Payments</h1>
          <p className="text-sm text-muted-foreground">
            Track invoice status, outstanding balance, and payment settlements.
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
            placeholder="Invoice or PO number..."
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
            <option value="POSTED">POSTED</option>
            <option value="PARTIALLY_PAID">PARTIALLY_PAID</option>
            <option value="PAID">PAID</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading invoices...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Invoice Total</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {fmtAmount(data.summary.invoiceTotal)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Settled Total</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {fmtAmount(data.summary.settledTotal)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-semibold">
                {fmtAmount(data.summary.outstandingTotal)}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {data.rows.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  No invoices found.
                </CardContent>
              </Card>
            ) : (
              data.rows.map((row) => (
                <Card key={row.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{row.invoiceNumber}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="outline">{row.status}</Badge>
                        <Badge variant="outline">{row.matchStatus}</Badge>
                        {row.paymentHoldStatus !== "CLEAR" ? (
                          <Badge variant="destructive">{row.paymentHoldStatus}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Issue: {fmtDate(row.issueDate)} | Due: {fmtDate(row.dueDate)} | PO:{" "}
                      {row.purchaseOrder?.poNumber ?? "N/A"}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>
                      Total: <span className="font-medium">{fmtAmount(row.total)}</span> {row.currency} |
                      Settled: {fmtAmount(row.settledAmount)} | Outstanding:{" "}
                      <span className="font-medium">{fmtAmount(row.outstandingAmount)}</span>
                    </p>
                    {row.paymentHoldReason ? (
                      <p className="text-xs text-muted-foreground">
                        Hold reason: {row.paymentHoldReason}
                      </p>
                    ) : null}
                    {row.payments.length > 0 ? (
                      <div className="rounded-md border p-3">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Payment History
                        </p>
                        <div className="space-y-1">
                          {row.payments.map((payment) => (
                            <p key={payment.id} className="text-xs">
                              {payment.paymentNumber} | {fmtDate(payment.paymentDate)} |{" "}
                              {fmtAmount(payment.amount)} | {payment.method}
                            </p>
                          ))}
                        </div>
                      </div>
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
