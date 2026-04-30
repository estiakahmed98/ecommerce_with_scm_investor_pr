"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Download, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type MaterialRelease = {
  id: number;
  releaseNumber: string;
  challanNumber: string | null;
  waybillNumber: string | null;
  status: string;
  releasedAt: string;
  note: string | null;
  warehouse: Warehouse;
  materialRequest: {
    id: number;
    requestNumber: string;
  };
  items: Array<{
    id: number;
    quantityReleased: number;
    unitCost: string | null;
    productVariant: {
      id: number;
      sku: string;
      product: {
        id: number;
        name: string;
      };
    };
  }>;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || fallback);
  }
  return payload as T;
}

function formatDateTime(value: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function formatMoney(value: string | number | null | undefined) {
  return Number(value || 0).toFixed(2);
}

function toCsvValue(value: string | number | null | undefined) {
  const plain = value === null || value === undefined ? "" : String(value);
  return `"${plain.replace(/"/g, '""')}"`;
}

export default function MaterialReleaseReportPage() {
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canRead = permissions.some((permission) =>
    [
      "material_releases.read",
      "material_releases.manage",
      "material_requests.read",
      "material_requests.approve_admin",
    ].includes(permission),
  );

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [warehouseId, setWarehouseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [releases, setReleases] = useState<MaterialRelease[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (warehouseId) query.set("warehouseId", warehouseId);
      if (status !== "ALL") query.set("status", status);
      if (from) query.set("from", from);
      if (to) query.set("to", to);

      const [warehouseData, releaseData] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }).then((res) =>
          readJson<Warehouse[]>(res, "Failed to load warehouses"),
        ),
        fetch(`/api/scm/material-releases?${query.toString()}`, { cache: "no-store" }).then((res) =>
          readJson<MaterialRelease[]>(res, "Failed to load material release report"),
        ),
      ]);

      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setReleases(Array.isArray(releaseData) ? releaseData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load material release report");
      setReleases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadData();
    }
  }, [canRead]);

  const totals = useMemo(() => {
    const totalQty = releases.reduce(
      (sum, release) =>
        sum + release.items.reduce((lineSum, item) => lineSum + item.quantityReleased, 0),
      0,
    );

    const totalValue = releases.reduce(
      (sum, release) =>
        sum +
        release.items.reduce(
          (lineSum, item) => lineSum + Number(item.unitCost || 0) * item.quantityReleased,
          0,
        ),
      0,
    );

    return {
      count: releases.length,
      totalQty,
      totalValue,
    };
  }, [releases]);

  const exportCsv = () => {
    if (releases.length === 0) {
      toast.error("No rows to export");
      return;
    }

    const rows = [
      [
        "Release No",
        "Date",
        "Warehouse",
        "Request No",
        "Challan",
        "Waybill",
        "Status",
        "Total Qty",
        "Total Value",
      ],
      ...releases.map((release) => {
        const qty = release.items.reduce((sum, item) => sum + item.quantityReleased, 0);
        const value = release.items.reduce(
          (sum, item) => sum + Number(item.unitCost || 0) * item.quantityReleased,
          0,
        );
        return [
          release.releaseNumber,
          formatDateTime(release.releasedAt),
          `${release.warehouse.name} (${release.warehouse.code})`,
          release.materialRequest.requestNumber,
          release.challanNumber || "",
          release.waybillNumber || "",
          release.status,
          qty,
          formatMoney(value),
        ];
      }),
    ];

    const csv = rows
      .map((row) => row.map((item) => toCsvValue(item as string | number)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `material-release-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
            <CardDescription>
              You do not have permission to access material release reports.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Material Release Report</h1>
        <p className="text-sm text-muted-foreground">
          Review release notes with challan/waybill traceability and export report snapshots.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <Label>Search</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Release/challan/waybill/request"
              />
            </div>
            <div>
              <Label>Warehouse</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                <option value="">All</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="ALL">All</option>
                <option value="ISSUED">ISSUED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
            <div>
              <Label>From</Label>
              <Input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Release Notes</div>
            <div className="text-2xl font-bold">{totals.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Released Qty</div>
            <div className="text-2xl font-bold">{totals.totalQty}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Released Value</div>
            <div className="text-2xl font-bold">{formatMoney(totals.totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Release Register</CardTitle>
          <CardDescription>
            Use print actions to generate challan/waybill documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading report rows...</p>
          ) : releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No release data found for selected filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Release</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release) => {
                  const qty = release.items.reduce((sum, item) => sum + item.quantityReleased, 0);
                  const value = release.items.reduce(
                    (sum, item) => sum + Number(item.unitCost || 0) * item.quantityReleased,
                    0,
                  );

                  return (
                    <TableRow key={release.id}>
                      <TableCell>
                        <Link
                          href={`/admin/scm/material-releases/${release.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {release.releaseNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(release.releasedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          CHL: {release.challanNumber || "N/A"} | WBL: {release.waybillNumber || "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {release.warehouse.name} ({release.warehouse.code})
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/scm/material-requests/${release.materialRequest.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {release.materialRequest.requestNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{release.status}</TableCell>
                      <TableCell>{qty}</TableCell>
                      <TableCell>{formatMoney(value)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(
                                `/admin/scm/material-releases/${release.id}/print?type=challan`,
                                "_blank",
                              )
                            }
                          >
                            <Printer className="mr-1 h-3.5 w-3.5" /> Challan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(
                                `/admin/scm/material-releases/${release.id}/print?type=waybill`,
                                "_blank",
                              )
                            }
                          >
                            <Printer className="mr-1 h-3.5 w-3.5" /> Waybill
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
