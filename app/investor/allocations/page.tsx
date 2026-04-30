"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AllocationPayload = {
  allocations: Array<{
    id: number;
    status: string;
    participationPercent: string;
    committedAmount: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    note: string | null;
    productVariant: {
      id: number;
      sku: string;
      product: { id: number; name: string };
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
  return parsed.toLocaleDateString();
}

export default function InvestorAllocationsPage() {
  const [data, setData] = useState<AllocationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/investor/allocations", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Failed to load allocations.");
        if (active) {
          setData(payload as AllocationPayload);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || "Failed to load allocations.");
        }
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
        <h1 className="text-2xl font-semibold">Investor Allocations</h1>
        <p className="text-sm text-muted-foreground">
          Product participation scopes assigned to your investor account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Allocation Register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
          {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Share %</TableHead>
                    <TableHead>Committed</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.allocations || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.productVariant.product.name} ({item.productVariant.sku})
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.status === "ACTIVE" ? "default" : "outline"}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtAmount(item.participationPercent)}%</TableCell>
                      <TableCell>{fmtAmount(item.committedAmount)}</TableCell>
                      <TableCell>
                        {fmtDate(item.effectiveFrom)} to {fmtDate(item.effectiveTo)}
                      </TableCell>
                      <TableCell>{item.note || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {data?.allocations?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        No allocations found.
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

