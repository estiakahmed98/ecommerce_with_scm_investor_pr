"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScmDocumentLifecycle } from "@/components/admin/scm/ScmDocumentLifecycle";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type AssetRow = {
  id: number;
  assetTag: string;
  warehouseId: number;
  productVariantId: number;
  status: "ACTIVE" | "RETIRED" | "LOST" | "DISPOSED";
  assignedTo: string | null;
  note: string | null;
  acquiredAt: string;
  warehouse: { id: number; name: string; code: string };
  productVariant: { id: number; sku: string; product: { id: number; name: string } };
  materialRequest: { id: number; requestNumber: string } | null;
  materialReleaseNote: { id: number; releaseNumber: string; challanNumber: string | null; waybillNumber: string | null } | null;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || fallback);
  return payload as T;
}

function formatDate(value: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function toStageLabel(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assetId = Number(params?.id);
  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAsset = async () => {
    if (!Number.isInteger(assetId) || assetId <= 0) {
      toast.error("Invalid asset id");
      router.replace("/admin/scm/assets");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/scm/assets/${assetId}`, { cache: "no-store" });
      const data = await readJson<AssetRow>(response, "Failed to load asset");
      setAsset(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load asset");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAsset(); }, [assetId]);

  const lifecycleStages = useMemo(() => {
    if (!asset) return [];
    return [
      { key: "request", label: "Material Request", value: asset.materialRequest?.requestNumber || "Not linked", helperText: asset.materialRequest ? "Source request available" : "No source request", href: asset.materialRequest ? `/admin/scm/material-requests/${asset.materialRequest.id}` : null, state: asset.materialRequest ? ("linked" as const) : ("pending" as const) },
      { key: "release", label: "Material Release", value: asset.materialReleaseNote?.releaseNumber || "Not linked", helperText: asset.materialReleaseNote ? "Asset released from warehouse" : "No release note", href: asset.materialReleaseNote ? `/admin/scm/material-releases/${asset.materialReleaseNote.id}` : null, state: asset.materialReleaseNote ? ("linked" as const) : ("pending" as const) },
      { key: "asset", label: "Asset Register", value: asset.assetTag, helperText: toStageLabel(asset.status), href: `/admin/scm/assets/${asset.id}`, state: "current" as const },
    ];
  }, [asset]);

  if (loading) return <div className="space-y-6 p-6"><p className="text-sm text-muted-foreground">Loading asset workspace...</p></div>;
  if (!asset) return <div className="space-y-6 p-6"><Button asChild variant="outline"><Link href="/admin/scm/assets"><ArrowLeft className="mr-2 h-4 w-4" />Back To Register</Link></Button><Card><CardContent className="py-10 text-sm text-muted-foreground">Asset not found.</CardContent></Card></div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline" size="sm"><Link href="/admin/scm/assets"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button><ScmStatusChip status={asset.status} /></div>
          <div><h1 className="text-2xl font-bold">{asset.assetTag}</h1><p className="text-sm text-muted-foreground">{asset.productVariant.product.name} • {asset.warehouse.name}</p></div>
        </div>
        <Button variant="outline" onClick={() => void loadAsset()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Warehouse" value={asset.warehouse.name} hint={asset.warehouse.code} />
        <ScmStatCard label="Item" value={asset.productVariant.product.name} hint={asset.productVariant.sku} />
        <ScmStatCard label="Status" value={asset.status} hint={asset.assignedTo || "Not assigned"} />
        <ScmStatCard label="Acquired" value={new Date(asset.acquiredAt).toLocaleDateString()} hint={formatDate(asset.acquiredAt)} />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="justify-start"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="source">Source Docs</TabsTrigger></TabsList>
        <TabsContent value="overview"><Card><CardHeader><CardTitle>Asset Context</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div><div className="text-xs uppercase tracking-wide text-muted-foreground">Assigned To</div><p className="mt-2 text-sm">{asset.assignedTo || "-"}</p></div><div><div className="text-xs uppercase tracking-wide text-muted-foreground">Lifecycle Note</div><p className="mt-2 text-sm whitespace-pre-wrap">{asset.note || "-"}</p></div></CardContent></Card></TabsContent>
        <TabsContent value="source"><Card><CardHeader><CardTitle>Source Documents</CardTitle></CardHeader><CardContent className="space-y-3"><div className="rounded-lg border p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Material Request</div><div className="mt-2 text-sm">{asset.materialRequest ? <Link href={`/admin/scm/material-requests/${asset.materialRequest.id}`} className="underline-offset-4 hover:underline">{asset.materialRequest.requestNumber}</Link> : "-"}</div></div><div className="rounded-lg border p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Material Release</div><div className="mt-2 text-sm">{asset.materialReleaseNote ? <Link href={`/admin/scm/material-releases/${asset.materialReleaseNote.id}`} className="underline-offset-4 hover:underline">{asset.materialReleaseNote.releaseNumber}</Link> : "-"}</div></div></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
