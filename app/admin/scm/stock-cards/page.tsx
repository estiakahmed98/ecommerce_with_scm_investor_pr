"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
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

type StockCardSummary = {
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  variantId: number;
  sku: string;
  productName: string;
  inventoryItemClass: "CONSUMABLE" | "PERMANENT";
  requiresAssetTag: boolean;
  quantity: number;
  reserved: number;
  available: number;
  lastMovementAt: string | null;
};

type StockCardMovement = {
  id: number;
  createdAt: string;
  change: number;
  reason: string;
};

type StockCardDetail = {
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  variantId: number;
  sku: string;
  productName: string;
  inventoryItemClass: "CONSUMABLE" | "PERMANENT";
  requiresAssetTag: boolean;
  quantity: number;
  reserved: number;
  available: number;
  openingBalance: number;
  movementDelta: number;
  closingBalance: number;
  movements: StockCardMovement[];
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

export default function StockCardsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canRead = permissions.some((permission) =>
    [
      "inventory.manage",
      "material_releases.read",
      "material_releases.manage",
      "material_requests.approve_admin",
    ].includes(permission),
  );

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [warehouseId, setWarehouseId] = useState(searchParams.get("warehouseId") || "");
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [summaries, setSummaries] = useState<StockCardSummary[]>([]);
  const [selected, setSelected] = useState<{ warehouseId: number; variantId: number } | null>(null);
  const [detail, setDetail] = useState<StockCardDetail | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const [warehouseData, stockData] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }).then((res) =>
          readJson<Warehouse[]>(res, "Failed to load warehouses"),
        ),
        fetch(
          `/api/scm/stock-cards?search=${encodeURIComponent(search)}${
            warehouseId ? `&warehouseId=${encodeURIComponent(warehouseId)}` : ""
          }`,
          { cache: "no-store" },
        ).then((res) =>
          readJson<{ summaries: StockCardSummary[]; detail: StockCardDetail | null }>(
            res,
            "Failed to load stock cards",
          ),
        ),
      ]);

      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      const nextSummaries = Array.isArray(stockData.summaries) ? stockData.summaries : [];
      setSummaries(nextSummaries);

      if (selected) {
        const stillExists = nextSummaries.some(
          (item) => item.warehouseId === selected.warehouseId && item.variantId === selected.variantId,
        );
        if (!stillExists) {
          setSelected(null);
          setDetail(null);
        }
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to load stock cards");
      setSummaries([]);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (target: { warehouseId: number; variantId: number }) => {
    setDetailLoading(true);
    try {
      const response = await fetch(
        `/api/scm/stock-cards?warehouseId=${target.warehouseId}&variantId=${target.variantId}${
          from ? `&from=${encodeURIComponent(from)}` : ""
        }${to ? `&to=${encodeURIComponent(to)}` : ""}`,
        { cache: "no-store" },
      );

      const payload = await readJson<{ summaries: StockCardSummary[]; detail: StockCardDetail | null }>(
        response,
        "Failed to load stock card detail",
      );
      setDetail(payload.detail || null);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load stock card detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadSummary();
    }
  }, [canRead]);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
    setWarehouseId(searchParams.get("warehouseId") || "");
    setFrom(searchParams.get("from") || "");
    setTo(searchParams.get("to") || "");
  }, [searchParams]);

  useEffect(() => {
    if (!canRead) return;
    const variantId = Number(searchParams.get("variantId") || 0);
    const queryWarehouseId = Number(searchParams.get("warehouseId") || 0);
    if (!variantId || !queryWarehouseId) return;
    const target = { warehouseId: queryWarehouseId, variantId };
    setSelected(target);
    void loadDetail(target);
  }, [canRead, searchParams]);

  const selectedLabel = useMemo(() => {
    if (!detail) return "";
    return `${detail.productName} (${detail.sku}) @ ${detail.warehouseName}`;
  }, [detail]);

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
            <CardDescription>
              You do not have permission to access stock cards.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Cards</h1>
        <p className="text-sm text-muted-foreground">
          Track item-wise historical stock movement with current warehouse balance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock Position</CardTitle>
          <CardDescription>
            Select a row to view opening, movement, and closing stock details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by product, sku, or warehouse"
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
            <Button variant="outline" onClick={() => void loadSummary()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading stock summaries...</p>
          ) : summaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock card data found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>On Hand</TableHead>
                  <TableHead>Reserved</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Last Movement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((item) => {
                  const active =
                    selected?.warehouseId === item.warehouseId &&
                    selected?.variantId === item.variantId;
                  return (
                    <TableRow
                      key={`${item.warehouseId}-${item.variantId}`}
                      className={active ? "bg-muted/40" : "cursor-pointer"}
                      onClick={() => {
                        const target = { warehouseId: item.warehouseId, variantId: item.variantId };
                        setSelected(target);
                        void loadDetail(target);
                      }}
                    >
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-xs text-muted-foreground">{item.sku}</div>
                      </TableCell>
                      <TableCell>
                        {item.warehouseName} ({item.warehouseCode})
                      </TableCell>
                      <TableCell>
                        {item.inventoryItemClass}
                        {item.requiresAssetTag ? " • TAG" : ""}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.reserved}</TableCell>
                      <TableCell>{item.available}</TableCell>
                      <TableCell>{formatDateTime(item.lastMovementAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>Stock Card Detail</CardTitle>
            <CardDescription>{selectedLabel || "Selected item"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label>From</Label>
                <Input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => selected && void loadDetail(selected)}
                  disabled={detailLoading}
                >
                  {detailLoading ? "Loading..." : "Apply Range"}
                </Button>
              </div>
            </div>

            {detail ? (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground">Opening</div>
                      <div className="text-xl font-semibold">{detail.openingBalance}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground">Movement</div>
                      <div className="text-xl font-semibold">{detail.movementDelta}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground">Closing</div>
                      <div className="text-xl font-semibold">{detail.closingBalance}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground">On Hand</div>
                      <div className="text-xl font-semibold">{detail.quantity}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground">Available</div>
                      <div className="text-xl font-semibold">{detail.available}</div>
                    </CardContent>
                  </Card>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{formatDateTime(movement.createdAt)}</TableCell>
                        <TableCell>{movement.change}</TableCell>
                        <TableCell>{movement.reason}</TableCell>
                      </TableRow>
                    ))}
                    {detail.movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">
                          No inventory movement in selected range.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </>
            ) : detailLoading ? (
              <p className="text-sm text-muted-foreground">Loading detail...</p>
            ) : (
              <p className="text-sm text-muted-foreground">Select a stock row to view detail.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
