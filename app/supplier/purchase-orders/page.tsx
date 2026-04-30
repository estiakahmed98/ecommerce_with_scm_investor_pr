"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SupplierPurchaseOrder = {
  id: number;
  poNumber: string;
  status: string;
  orderDate: string;
  expectedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  currency: string;
  subtotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  notes: string | null;
  warehouse: {
    id: number;
    name: string;
    code: string;
  };
  items: Array<{
    id: number;
    productVariantId: number;
    sku: string;
    productName: string;
    description: string | null;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: string;
    lineTotal: string;
  }>;
  goodsReceipts: Array<{
    id: number;
    receiptNumber: string;
    status: string;
    receivedAt: string;
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

export default function SupplierPurchaseOrdersPage() {
  const [rows, setRows] = useState<SupplierPurchaseOrder[]>([]);
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
        `/api/supplier/purchase-orders${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load purchase orders.");
      }
      setRows(Array.isArray(payload) ? (payload as SupplierPurchaseOrder[]) : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load purchase orders.");
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
          <h1 className="text-2xl font-semibold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">
            Review awarded purchase orders and inbound receipt status.
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
            placeholder="PO number or warehouse..."
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

      {loading ? <p className="text-sm text-muted-foreground">Loading purchase orders...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-4">
          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No purchase orders found.
              </CardContent>
            </Card>
          ) : (
            rows.map((row) => (
              <Card key={row.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{row.poNumber}</CardTitle>
                    <Badge variant="outline">{row.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Warehouse: {row.warehouse.name} ({row.warehouse.code}) | Order date:{" "}
                    {fmtDate(row.orderDate)} | Expected: {fmtDate(row.expectedAt)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <p>
                      Total: <span className="font-medium">{fmtAmount(row.grandTotal)}</span>{" "}
                      {row.currency}
                    </p>
                    <p className="text-muted-foreground">
                      Receipts:{" "}
                      {row.goodsReceipts.length > 0
                        ? row.goodsReceipts.map((receipt) => receipt.receiptNumber).join(", ")
                        : "No receipts posted yet"}
                    </p>
                  </div>

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
                        {row.items.map((item) => (
                          <tr key={item.id} className="border-b">
                            <td className="py-2">
                              <div className="font-medium">{item.productName}</div>
                              <div className="text-xs text-muted-foreground">{item.sku}</div>
                            </td>
                            <td className="py-2">{item.quantityOrdered}</td>
                            <td className="py-2">{item.quantityReceived}</td>
                            <td className="py-2">
                              {fmtAmount(item.unitCost)} {row.currency}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
