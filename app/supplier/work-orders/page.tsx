"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SupplierWorkOrder = {
  id: number;
  status: string;
  awardedAt: string;
  note: string | null;
  rfq: {
    id: number;
    rfqNumber: string;
    requestedAt: string;
    submissionDeadline: string | null;
    warehouse: {
      id: number;
      code: string;
      name: string;
    };
  };
  purchaseOrder: {
    id: number;
    poNumber: string;
    status: string;
    orderDate: string;
    expectedAt: string | null;
    receivedAt: string | null;
    currency: string;
    grandTotal: string;
    notes: string | null;
    items: Array<{
      id: number;
      productName: string;
      sku: string;
      quantityOrdered: number;
      quantityReceived: number;
      unitCost: string;
      lineTotal: string;
    }>;
  } | null;
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

export default function SupplierWorkOrdersPage() {
  const [rows, setRows] = useState<SupplierWorkOrder[]>([]);
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
        `/api/supplier/work-orders${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load work orders.");
      }
      setRows(Array.isArray(payload) ? (payload as SupplierWorkOrder[]) : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load work orders.");
      setRows([]);
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
          <h1 className="text-2xl font-semibold">Work Orders</h1>
          <p className="text-sm text-muted-foreground">
            Review awarded RFQs converted to executable purchase work orders.
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
            placeholder="RFQ / PO number..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>PO Status</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="MANAGER_APPROVED">MANAGER_APPROVED</option>
            <option value="COMMITTEE_APPROVED">COMMITTEE_APPROVED</option>
            <option value="APPROVED">APPROVED</option>
            <option value="PARTIALLY_RECEIVED">PARTIALLY_RECEIVED</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading work orders...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No work orders found.
              </CardContent>
            </Card>
          ) : (
            rows.map((row) => (
              <Card key={row.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {row.purchaseOrder?.poNumber ?? "Pending PO"} | {row.rfq.rfqNumber}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Badge variant="outline">{row.status}</Badge>
                      {row.purchaseOrder ? (
                        <Badge variant="outline">{row.purchaseOrder.status}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Warehouse: {row.rfq.warehouse.name} ({row.rfq.warehouse.code}) | Awarded:{" "}
                    {fmtDate(row.awardedAt)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {row.purchaseOrder ? (
                    <>
                      <p className="text-sm">
                        Order Date: {fmtDate(row.purchaseOrder.orderDate)} | Expected:{" "}
                        {fmtDate(row.purchaseOrder.expectedAt)} | Received:{" "}
                        {fmtDate(row.purchaseOrder.receivedAt)} | Total:{" "}
                        {fmtAmount(row.purchaseOrder.grandTotal)} {row.purchaseOrder.currency}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-muted-foreground">
                            <tr className="border-b">
                              <th className="pb-2">Item</th>
                              <th className="pb-2">Ordered</th>
                              <th className="pb-2">Received</th>
                              <th className="pb-2">Unit Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.purchaseOrder.items.map((item) => (
                              <tr key={item.id} className="border-b">
                                <td className="py-2">
                                  <div className="font-medium">{item.productName}</div>
                                  <div className="text-xs text-muted-foreground">{item.sku}</div>
                                </td>
                                <td className="py-2">{item.quantityOrdered}</td>
                                <td className="py-2">{item.quantityReceived}</td>
                                <td className="py-2">{fmtAmount(item.unitCost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Award is recorded but PO is not linked yet.
                    </p>
                  )}
                  {row.note ? <p className="text-xs text-muted-foreground">Award note: {row.note}</p> : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
