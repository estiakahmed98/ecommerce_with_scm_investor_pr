"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw, Save } from "lucide-react";
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

type AssetRow = {
  id: number;
  assetTag: string;
  warehouseId: number;
  productVariantId: number;
  status: "ACTIVE" | "RETIRED" | "LOST" | "DISPOSED";
  assignedTo: string | null;
  note: string | null;
  acquiredAt: string;
  warehouse: Warehouse;
  productVariant: {
    id: number;
    sku: string;
    product: {
      id: number;
      name: string;
    };
  };
  materialRequest: {
    id: number;
    requestNumber: string;
  } | null;
  materialReleaseNote: {
    id: number;
    releaseNumber: string;
    challanNumber: string | null;
    waybillNumber: string | null;
  } | null;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

type AssetSummary = {
  total: number;
  active: number;
  retired: number;
  lost: number;
  disposed: number;
};

type AssetDraft = {
  status: AssetRow["status"];
  assignedTo: string;
  note: string;
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

export default function AssetLifecyclePage() {
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canRead = permissions.some((permission) =>
    ["asset_register.read", "asset_register.manage"].includes(permission),
  );
  const canManage = permissions.includes("asset_register.manage");

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [summary, setSummary] = useState<AssetSummary>({
    total: 0,
    active: 0,
    retired: 0,
    lost: 0,
    disposed: 0,
  });
  const [drafts, setDrafts] = useState<Record<number, AssetDraft>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (status !== "ALL") query.set("status", status);
      if (warehouseId) query.set("warehouseId", warehouseId);

      const [warehouseData, payload] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }).then((res) =>
          readJson<Warehouse[]>(res, "Failed to load warehouses"),
        ),
        fetch(`/api/scm/assets?${query.toString()}`, { cache: "no-store" }).then((res) =>
          readJson<{ assets: AssetRow[]; summary: AssetSummary }>(res, "Failed to load assets"),
        ),
      ]);

      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setAssets(Array.isArray(payload.assets) ? payload.assets : []);
      setSummary(
        payload.summary || {
          total: 0,
          active: 0,
          retired: 0,
          lost: 0,
          disposed: 0,
        },
      );

      setDrafts((current) => {
        const next = { ...current };
        for (const asset of Array.isArray(payload.assets) ? payload.assets : []) {
          if (!next[asset.id]) {
            next[asset.id] = {
              status: asset.status,
              assignedTo: asset.assignedTo || "",
              note: asset.note || "",
            };
          }
        }
        return next;
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to load assets");
      setAssets([]);
      setSummary({ total: 0, active: 0, retired: 0, lost: 0, disposed: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadData();
    }
  }, [canRead]);

  const visibleAssets = useMemo(() => assets, [assets]);

  const saveAsset = async (asset: AssetRow) => {
    const draft = drafts[asset.id];
    if (!draft) return;

    setSavingId(asset.id);
    try {
      const response = await fetch(`/api/scm/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draft.status,
          assignedTo: draft.assignedTo,
          note: draft.note,
        }),
      });

      await readJson(response, "Failed to update asset");
      toast.success(`Updated ${asset.assetTag}`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update asset");
    } finally {
      setSavingId(null);
    }
  };

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
            <CardDescription>
              You do not have permission to access asset register.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Asset Lifecycle</h1>
        <p className="text-sm text-muted-foreground">
          Monitor fixed-asset tags from material release and manage lifecycle status.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="text-2xl font-bold">{summary.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Retired</div>
            <div className="text-2xl font-bold">{summary.retired}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Lost</div>
            <div className="text-2xl font-bold">{summary.lost}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Disposed</div>
            <div className="text-2xl font-bold">{summary.disposed}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asset Register</CardTitle>
          <CardDescription>
            Filter and update assigned owner, status, and lifecycle notes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tag, item, sku, assigned owner"
            />
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="RETIRED">RETIRED</option>
              <option value="LOST">LOST</option>
              <option value="DISPOSED">DISPOSED</option>
            </select>
            <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading assets...</p>
          ) : visibleAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleAssets.map((asset) => {
                  const draft = drafts[asset.id] || {
                    status: asset.status,
                    assignedTo: asset.assignedTo || "",
                    note: asset.note || "",
                  };

                  return (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <div className="font-medium">{asset.assetTag}</div>
                        <div className="text-xs text-muted-foreground">{asset.productVariant.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {asset.productVariant.sku} • {formatDateTime(asset.acquiredAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {asset.warehouse.name} ({asset.warehouse.code})
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          MRF: {asset.materialRequest?.requestNumber || "N/A"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          MRN: {asset.materialReleaseNote?.releaseNumber || "N/A"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <select
                            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                            value={draft.status}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [asset.id]: {
                                  ...draft,
                                  status: event.target.value as AssetRow["status"],
                                },
                              }))
                            }
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="RETIRED">RETIRED</option>
                            <option value="LOST">LOST</option>
                            <option value="DISPOSED">DISPOSED</option>
                          </select>
                        ) : (
                          asset.status
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Input
                            value={draft.assignedTo}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [asset.id]: {
                                  ...draft,
                                  assignedTo: event.target.value,
                                },
                              }))
                            }
                            placeholder="Person/department"
                          />
                        ) : (
                          asset.assignedTo || "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Input
                            value={draft.note}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [asset.id]: {
                                  ...draft,
                                  note: event.target.value,
                                },
                              }))
                            }
                            placeholder="Lifecycle note"
                          />
                        ) : (
                          asset.note || "N/A"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="mb-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/admin/scm/assets/${asset.id}`}>Open Detail</Link>
                          </Button>
                        </div>
                        {canManage ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void saveAsset(asset)}
                            disabled={savingId === asset.id}
                          >
                            <Save className="mr-1 h-3.5 w-3.5" />
                            {savingId === asset.id ? "Saving..." : "Save"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Read only</span>
                        )}
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
