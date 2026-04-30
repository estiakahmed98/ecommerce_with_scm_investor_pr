"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type OverviewResponse = {
  supplier: {
    id: number;
    code: string;
    name: string;
  };
  summary: {
    actionableRfqCount: number;
    respondedRfqCount: number;
    activePurchaseOrderCount: number;
    dueSoonPurchaseOrderCount: number;
    overdueInvoiceCount: number;
    outstandingAmount: string;
    recentPaymentAmount: string;
    pendingProfileRequestCount: number;
    expiringDocumentCount: number;
    unreadNotificationCount: number;
  };
  recentRfqs: Array<{
    inviteId: number;
    status: string;
    invitedAt: string;
    respondedAt: string | null;
    quotationId: number | null;
    rfq: {
      id: number;
      rfqNumber: string;
      status: string;
      requestedAt: string;
      submissionDeadline: string | null;
    };
  }>;
  recentPurchaseOrders: Array<{
    id: number;
    poNumber: string;
    status: string;
    orderDate: string;
    expectedAt: string | null;
    grandTotal: string;
  }>;
  recentInvoices: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    dueDate: string | null;
    total: string;
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

export default function SupplierDashboardPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/supplier/overview", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load supplier overview.");
        }
        if (active) {
          setData(payload as OverviewResponse);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || "Failed to load supplier overview.");
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

  const summaryCards = useMemo(
    () =>
      data
        ? [
            { label: "Action Required RFQ", value: data.summary.actionableRfqCount },
            { label: "Active Purchase Orders", value: data.summary.activePurchaseOrderCount },
            { label: "Overdue Invoices", value: data.summary.overdueInvoiceCount },
            { label: "Outstanding Amount", value: fmtAmount(data.summary.outstandingAmount) },
            { label: "Pending Update Requests", value: data.summary.pendingProfileRequestCount },
            { label: "Expiring Documents (30d)", value: data.summary.expiringDocumentCount },
            { label: "Unread Notifications", value: data.summary.unreadNotificationCount },
          ]
        : [],
    [data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Supplier Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Track RFQ actions, purchase orders, and payable status for your account.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading supplier overview...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            {summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{card.value}</CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Recent RFQs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentRfqs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No RFQ invitations found.</p>
                ) : (
                  data.recentRfqs.map((row) => (
                    <div key={row.inviteId} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{row.rfq.rfqNumber}</p>
                        <Badge variant="outline">{row.rfq.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Deadline: {fmtDate(row.rfq.submissionDeadline)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Recent Purchase Orders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentPurchaseOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchase orders available.</p>
                ) : (
                  data.recentPurchaseOrders.map((row) => (
                    <div key={row.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{row.poNumber}</p>
                        <Badge variant="outline">{row.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Total: {fmtAmount(row.grandTotal)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Recent Invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices available.</p>
                ) : (
                  data.recentInvoices.map((row) => (
                    <div key={row.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{row.invoiceNumber}</p>
                        <Badge variant="outline">{row.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Due: {fmtDate(row.dueDate)} | Total: {fmtAmount(row.total)}
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
