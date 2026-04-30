"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScmDocumentLifecycle } from "@/components/admin/scm/ScmDocumentLifecycle";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type MaterialRelease = {
  id: number;
  releaseNumber: string;
  status: string;
  challanNumber: string | null;
  waybillNumber: string | null;
  note: string | null;
  releasedAt: string;
  warehouse: { id: number; name: string; code: string };
  releasedBy: { id: string; name: string | null; email: string } | null;
  materialRequest: {
    id: number;
    requestNumber: string;
    status: string;
    createdBy: { id: string; name: string | null; email: string } | null;
  };
  items: Array<{
    id: number;
    quantityReleased: number;
    unitCost: string | null;
    materialRequestItem: {
      id: number;
      quantityRequested: number;
      quantityReleased: number;
    };
    productVariant: {
      id: number;
      sku: string;
      product: {
        id: number;
        name: string;
        inventoryItemClass: "CONSUMABLE" | "PERMANENT";
        requiresAssetTag: boolean;
      };
    };
    assetRegisters: Array<{
      id: number;
      assetTag: string;
      status: string;
    }>;
  }>;
  assetRegisters: Array<{
    id: number;
    assetTag: string;
    status: string;
    productVariantId: number;
  }>;
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function toStageLabel(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatMoney(value: string | number | null | undefined) {
  return Number(value || 0).toFixed(2);
}

export default function MaterialReleaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const materialReleaseId = Number(params?.id);
  const [materialRelease, setMaterialRelease] = useState<MaterialRelease | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMaterialRelease = async () => {
    if (!Number.isInteger(materialReleaseId) || materialReleaseId <= 0) {
      toast.error("Invalid material release id");
      router.replace("/admin/scm/material-releases");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/scm/material-releases/${materialReleaseId}`, {
        cache: "no-store",
      });
      const data = await readJson<MaterialRelease>(response, "Failed to load material release");
      setMaterialRelease(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load material release");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMaterialRelease();
  }, [materialReleaseId]);

  const lifecycleStages = useMemo(() => {
    if (!materialRelease) return [];
    return [
      {
        key: "request",
        label: "Material Request",
        value: materialRelease.materialRequest.requestNumber,
        helperText: toStageLabel(materialRelease.materialRequest.status),
        href: `/admin/scm/material-requests/${materialRelease.materialRequest.id}`,
        state: "linked" as const,
      },
      {
        key: "release",
        label: "Release Note",
        value: materialRelease.releaseNumber,
        helperText: toStageLabel(materialRelease.status),
        href: `/admin/scm/material-releases/${materialRelease.id}`,
        state: "current" as const,
      },
      {
        key: "assets",
        label: "Asset Tags",
        value: materialRelease.assetRegisters.length > 0 ? `${materialRelease.assetRegisters.length} tags` : "No tags",
        helperText: materialRelease.assetRegisters.length > 0 ? "Permanent assets registered" : "Consumable-only issue",
        href: null,
        state: materialRelease.assetRegisters.length > 0 ? ("linked" as const) : ("pending" as const),
      },
    ];
  }, [materialRelease]);

  if (loading) {
    return <div className="space-y-6 p-6"><p className="text-sm text-muted-foreground">Loading material release workspace...</p></div>;
  }

  if (!materialRelease) {
    return (
      <div className="space-y-6 p-6">
        <Button asChild variant="outline">
          <Link href="/admin/scm/material-releases">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To Register
          </Link>
        </Button>
        <Card><CardContent className="py-10 text-sm text-muted-foreground">Material release not found.</CardContent></Card>
      </div>
    );
  }

  const totalQty = materialRelease.items.reduce((sum, item) => sum + item.quantityReleased, 0);
  const totalValue = materialRelease.items.reduce((sum, item) => sum + Number(item.unitCost || 0) * item.quantityReleased, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scm/material-releases">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <ScmStatusChip status={materialRelease.status} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{materialRelease.releaseNumber}</h1>
            <p className="text-sm text-muted-foreground">{materialRelease.warehouse.name} • Request {materialRelease.materialRequest.requestNumber}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void loadMaterialRelease()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Warehouse" value={materialRelease.warehouse.name} hint={materialRelease.warehouse.code} />
        <ScmStatCard label="Released Qty" value={String(totalQty)} hint={`${materialRelease.items.length} release lines`} />
        <ScmStatCard label="Asset Tags" value={String(materialRelease.assetRegisters.length)} hint={materialRelease.assetRegisters.length > 0 ? "Generated from permanent items" : "No fixed asset tags"} />
        <ScmStatCard label="Issue Value" value={formatMoney(totalValue)} hint={`Released ${new Date(materialRelease.releasedAt).toLocaleDateString()}`} />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="assets">Assets</TabsTrigger>
              <TabsTrigger value="request">Linked Request</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle>Release Metadata</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Released At</div><p className="mt-2 text-sm">{fmtDate(materialRelease.releasedAt)}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Released By</div><p className="mt-2 text-sm">{materialRelease.releasedBy?.name || materialRelease.releasedBy?.email || "-"}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Challan Number</div><p className="mt-2 text-sm">{materialRelease.challanNumber || "-"}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Waybill Number</div><p className="mt-2 text-sm">{materialRelease.waybillNumber || "-"}</p></div>
                  <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Note</div><p className="mt-2 text-sm whitespace-pre-wrap">{materialRelease.note || "-"}</p></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="items">
              <Card>
                <CardHeader><CardTitle>Issued Items</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Released</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Line Value</TableHead>
                        <TableHead>Asset Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialRelease.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productVariant.product.name}</div>
                            <div className="text-xs text-muted-foreground">{item.productVariant.sku}</div>
                          </TableCell>
                          <TableCell>{item.quantityReleased}</TableCell>
                          <TableCell>{formatMoney(item.unitCost)}</TableCell>
                          <TableCell>{formatMoney(Number(item.unitCost || 0) * item.quantityReleased)}</TableCell>
                          <TableCell>{item.assetRegisters.length > 0 ? `${item.assetRegisters.length} tags` : "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assets">
              <Card>
                <CardHeader><CardTitle>Generated Asset Tags</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {materialRelease.assetRegisters.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No asset tags were generated for this release.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {materialRelease.assetRegisters.map((asset) => (
                        <div key={asset.id} className="rounded-lg border p-3 text-sm">
                          <div className="font-medium">{asset.assetTag}</div>
                          <div className="text-muted-foreground">{toStageLabel(asset.status)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="request">
              <Card>
                <CardHeader><CardTitle>Source Material Request</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Request Number</div>
                    <div className="mt-2 text-sm">
                      <Link href={`/admin/scm/material-requests/${materialRelease.materialRequest.id}`} className="underline-offset-4 hover:underline">
                        {materialRelease.materialRequest.requestNumber}
                      </Link>
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Requester</div>
                    <div className="mt-2 text-sm">{materialRelease.materialRequest.createdBy?.name || materialRelease.materialRequest.createdBy?.email || "-"}</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Document Links</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`/admin/scm/material-requests/${materialRelease.materialRequest.id}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Source Request
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
