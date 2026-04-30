"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, ClipboardCheck, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScmSectionHeader } from "@/components/admin/scm/ScmSectionHeader";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type MaterialRequest = {
  id: number;
  requestNumber: string;
  warehouseId: number;
  status: string;
  purpose: string | null;
  requiredBy: string | null;
  warehouse: Warehouse;
  items: Array<{
    id: number;
    quantityRequested: number;
    quantityReleased: number;
    productVariantId: number;
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

type MaterialRelease = {
  id: number;
  releaseNumber: string;
};

type ReleaseDraftItem = {
  materialRequestItemId: number;
  productName: string;
  sku: string;
  quantityRequested: number;
  quantityReleased: number;
  remainingQty: number;
  quantityToRelease: string;
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

export default function NewMaterialReleasePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canManage = permissions.includes("material_releases.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);
  const [materialRequestId, setMaterialRequestId] = useState("");
  const [note, setNote] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [waybillNumber, setWaybillNumber] = useState("");
  const [releaseItems, setReleaseItems] = useState<ReleaseDraftItem[]>([]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const requestData = await fetch("/api/scm/material-requests", { cache: "no-store" }).then((res) =>
        readJson<MaterialRequest[]>(res, "Failed to load material requests"),
      );
      setMaterialRequests(Array.isArray(requestData) ? requestData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load releasable requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) {
      void loadRequests();
    }
  }, [canManage]);

  const releasableRequests = useMemo(
    () =>
      materialRequests.filter((request) =>
        ["ADMIN_APPROVED", "PARTIALLY_RELEASED"].includes(request.status),
      ),
    [materialRequests],
  );

  const selectedMaterialRequest = useMemo(
    () => releasableRequests.find((request) => request.id === Number(materialRequestId)) ?? null,
    [materialRequestId, releasableRequests],
  );

  useEffect(() => {
    if (!selectedMaterialRequest) {
      setReleaseItems([]);
      return;
    }

    setReleaseItems(
      selectedMaterialRequest.items.map((item) => {
        const remainingQty = Math.max(0, item.quantityRequested - item.quantityReleased);
        return {
          materialRequestItemId: item.id,
          productName: item.productVariant.product.name,
          sku: item.productVariant.sku,
          quantityRequested: item.quantityRequested,
          quantityReleased: item.quantityReleased,
          remainingQty,
          quantityToRelease: remainingQty > 0 ? String(remainingQty) : "",
        };
      }),
    );
  }, [selectedMaterialRequest]);

  const summary = useMemo(
    () => ({
      releasable: releasableRequests.length,
      openLines:
        selectedMaterialRequest?.items.reduce(
          (sum, item) => sum + Math.max(item.quantityRequested - item.quantityReleased, 0),
          0,
        ) ?? 0,
      partialRequests: releasableRequests.filter((request) => request.status === "PARTIALLY_RELEASED")
        .length,
    }),
    [releasableRequests, selectedMaterialRequest],
  );

  const updateReleaseItem = (index: number, value: string) => {
    setReleaseItems((current) =>
      current.map((item, idx) => (idx === index ? { ...item, quantityToRelease: value } : item)),
    );
  };

  const createRelease = async () => {
    if (!selectedMaterialRequest) {
      toast.error("Material request is required");
      return;
    }

    const payloadItems = releaseItems
      .map((item) => ({
        materialRequestItemId: item.materialRequestItemId,
        quantityReleased: Number(item.quantityToRelease),
      }))
      .filter((item) => Number.isInteger(item.quantityReleased) && item.quantityReleased > 0);

    if (payloadItems.length === 0) {
      toast.error("No valid release quantity found");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/scm/material-releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialRequestId: selectedMaterialRequest.id,
          note,
          challanNumber: challanNumber || null,
          waybillNumber: waybillNumber || null,
          items: payloadItems,
        }),
      });
      const created = await readJson<MaterialRelease>(response, "Failed to issue material release");
      toast.success("Material release issued");
      router.push(`/admin/scm/material-releases?search=${encodeURIComponent(created.releaseNumber)}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to issue material release");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You do not have permission to issue material releases.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <ScmSectionHeader
        title="Issue Material Release"
        description="Use the guided warehouse issue flow to select an approved request, confirm release quantities, and generate challan and waybill cleanly."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/scm/material-releases">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back To Register
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void loadRequests()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <ScmStatCard label="Releasable Requests" value={String(summary.releasable)} hint="Approved or partially released requests" />
        <ScmStatCard label="Partial Requests" value={String(summary.partialRequests)} hint="Still have remaining warehouse issue quantity" icon={ClipboardCheck} />
        <ScmStatCard label="Open Units" value={String(summary.openLines)} hint="Remaining units on selected request" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Select Releasable Request</CardTitle>
          <CardDescription>
            Only administration-approved or partially released requests are eligible for warehouse issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Material Request</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={materialRequestId}
              onChange={(event) => setMaterialRequestId(event.target.value)}
            >
              <option value="">Select request</option>
              {releasableRequests.map((request) => (
                <option key={request.id} value={request.id}>
                  {request.requestNumber} - {request.warehouse.name} ({request.status})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Delivery Documents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Challan No (optional)</Label>
            <Input
              value={challanNumber}
              onChange={(event) => setChallanNumber(event.target.value)}
              placeholder="Auto if empty"
            />
          </div>
          <div className="space-y-2">
            <Label>Waybill No (optional)</Label>
            <Input
              value={waybillNumber}
              onChange={(event) => setWaybillNumber(event.target.value)}
              placeholder="Auto if empty"
            />
          </div>
          <div className="space-y-2">
            <Label>Issue Note</Label>
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Confirm Release Quantities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedMaterialRequest ? (
            <p className="text-sm text-muted-foreground">
              Select a releasable request first. Then the system will open the remaining warehouse issue lines.
            </p>
          ) : (
            <>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Request: {selectedMaterialRequest.requestNumber} | Warehouse: {selectedMaterialRequest.warehouse.name} | Required By: {formatDateTime(selectedMaterialRequest.requiredBy)}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Released</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Release Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releaseItems.map((item, index) => (
                    <TableRow key={item.materialRequestItemId}>
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-xs text-muted-foreground">{item.sku}</div>
                      </TableCell>
                      <TableCell>{item.quantityRequested}</TableCell>
                      <TableCell>{item.quantityReleased}</TableCell>
                      <TableCell>{item.remainingQty}</TableCell>
                      <TableCell className="w-40">
                        <Input
                          type="number"
                          min={0}
                          max={item.remainingQty}
                          value={item.quantityToRelease}
                          onChange={(event) => updateReleaseItem(index, event.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 4: Issue Release</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            When the release is posted, warehouse stock will move out and fixed-asset items will receive asset tags automatically where applicable.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin/scm/material-releases")}>
              Cancel
            </Button>
            <Button onClick={() => void createRelease()} disabled={saving || !selectedMaterialRequest}>
              {saving ? "Issuing..." : "Issue Release"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
