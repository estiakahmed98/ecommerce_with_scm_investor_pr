"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScmDocumentLifecycle } from "@/components/admin/scm/ScmDocumentLifecycle";
import { ScmNextStepPanel } from "@/components/admin/scm/ScmNextStepPanel";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type MaterialRequest = {
  id: number;
  requestNumber: string;
  status: string;
  title: string | null;
  purpose: string | null;
  budgetCode: string | null;
  boqReference: string | null;
  specification: string | null;
  note: string | null;
  requestedAt: string;
  requiredBy: string | null;
  submittedAt: string | null;
  supervisorEndorsedAt: string | null;
  projectManagerEndorsedAt: string | null;
  adminApprovedAt: string | null;
  warehouse: { id: number; name: string; code: string };
  createdBy: { id: string; name: string | null; email: string } | null;
  supervisorEndorsedBy?: { id: string; name: string | null; email: string } | null;
  projectManagerEndorsedBy?: { id: string; name: string | null; email: string } | null;
  adminApprovedBy?: { id: string; name: string | null; email: string } | null;
  items: Array<{
    id: number;
    description: string | null;
    quantityRequested: number;
    quantityReleased: number;
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
  }>;
  attachments: Array<{
    id: number;
    fileUrl: string;
    fileName: string;
    note: string | null;
    createdAt: string;
  }>;
  approvalEvents: Array<{
    id: number;
    stage: string;
    decision: string;
    note: string | null;
    actedAt: string;
    actedBy: { id: string; name: string | null; email: string } | null;
  }>;
  releaseNotes: Array<{
    id: number;
    releaseNumber: string;
    challanNumber: string | null;
    waybillNumber: string | null;
    releasedAt: string;
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
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function MaterialRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const materialRequestId = Number(params?.id);
  const { data: session } = useSession();
  const userId = (session?.user as any)?.id as string | undefined;
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canManage = permissions.includes("material_requests.manage");
  const canSupervisorEndorse = permissions.includes("material_requests.endorse_supervisor");
  const canProjectManagerEndorse = permissions.includes("material_requests.endorse_project_manager");
  const canAdminApprove = permissions.includes("material_requests.approve_admin");

  const [materialRequest, setMaterialRequest] = useState<MaterialRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflowNote, setWorkflowNote] = useState("");

  const loadMaterialRequest = async () => {
    if (!Number.isInteger(materialRequestId) || materialRequestId <= 0) {
      toast.error("Invalid material request id");
      router.replace("/admin/scm/material-requests");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/scm/material-requests/${materialRequestId}`, {
        cache: "no-store",
      });
      const data = await readJson<MaterialRequest>(response, "Failed to load material request");
      setMaterialRequest(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load material request");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMaterialRequest();
  }, [materialRequestId]);

  const actionButtons = useMemo(() => {
    if (!materialRequest) return [] as Array<{ action: string; label: string }>;
    const isOwner = materialRequest.createdBy?.id === userId;
    const buttons: Array<{ action: string; label: string }> = [];
    if (canManage && materialRequest.status === "DRAFT") {
      buttons.push({ action: "submit", label: "Submit" });
    }
    if (canSupervisorEndorse && materialRequest.status === "SUBMITTED") {
      buttons.push({ action: "endorse_supervisor", label: "Endorse (Supervisor)" });
    }
    if (canProjectManagerEndorse && materialRequest.status === "SUPERVISOR_ENDORSED") {
      buttons.push({ action: "endorse_project_manager", label: "Endorse (Project Manager)" });
    }
    if (canAdminApprove && materialRequest.status === "PROJECT_MANAGER_ENDORSED") {
      buttons.push({ action: "approve_admin", label: "Final Approve (Admin)" });
    }
    if (
      ["SUBMITTED", "SUPERVISOR_ENDORSED", "PROJECT_MANAGER_ENDORSED"].includes(materialRequest.status) &&
      (canSupervisorEndorse || canProjectManagerEndorse || canAdminApprove)
    ) {
      buttons.push({ action: "reject", label: "Reject" });
    }
    if (["DRAFT", "SUBMITTED"].includes(materialRequest.status) && (canManage || isOwner)) {
      buttons.push({ action: "cancel", label: "Cancel" });
    }
    return buttons;
  }, [materialRequest, canManage, canSupervisorEndorse, canProjectManagerEndorse, canAdminApprove, userId]);

  const lifecycleStages = useMemo(() => {
    if (!materialRequest) return [];
    const latestRelease = materialRequest.releaseNotes[0] ?? null;
    return [
      {
        key: "request",
        label: "Material Request",
        value: materialRequest.requestNumber,
        helperText: toStageLabel(materialRequest.status),
        href: `/admin/scm/material-requests/${materialRequest.id}`,
        state: "current" as const,
      },
      {
        key: "release",
        label: "Release",
        value: latestRelease?.releaseNumber || "Not issued",
        helperText: latestRelease ? `Released ${fmtDate(latestRelease.releasedAt)}` : "Awaiting approved issue",
        href: latestRelease ? `/admin/scm/material-releases/${latestRelease.id}` : null,
        state: latestRelease ? ("linked" as const) : ("pending" as const),
      },
    ];
  }, [materialRequest]);

  const runAction = async (action: string) => {
    if (!materialRequest) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/scm/material-requests/${materialRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: workflowNote || undefined }),
      });
      await readJson(response, `Failed to ${action} material request`);
      toast.success(`Material request ${toStageLabel(action)} completed`);
      setWorkflowNote("");
      await loadMaterialRequest();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} material request`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-6 p-6"><p className="text-sm text-muted-foreground">Loading material request workspace...</p></div>;
  }

  if (!materialRequest) {
    return (
      <div className="space-y-6 p-6">
        <Button asChild variant="outline">
          <Link href="/admin/scm/material-requests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To Register
          </Link>
        </Button>
        <Card><CardContent className="py-10 text-sm text-muted-foreground">Material request not found.</CardContent></Card>
      </div>
    );
  }

  const totalRequested = materialRequest.items.reduce((sum, item) => sum + item.quantityRequested, 0);
  const totalReleased = materialRequest.items.reduce((sum, item) => sum + item.quantityReleased, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scm/material-requests">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <ScmStatusChip status={materialRequest.status} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{materialRequest.requestNumber}</h1>
            <p className="text-sm text-muted-foreground">{materialRequest.warehouse.name} • {materialRequest.title || materialRequest.purpose || "Material requisition"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadMaterialRequest()} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {actionButtons.map((button) => (
            <Button
              key={button.action}
              variant={button.action === "reject" || button.action === "cancel" ? "outline" : "default"}
              onClick={() => void runAction(button.action)}
              disabled={saving}
            >
              {button.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Warehouse" value={materialRequest.warehouse.name} hint={materialRequest.warehouse.code} />
        <ScmStatCard label="Requested Qty" value={String(totalRequested)} hint={`${totalReleased} already released`} />
        <ScmStatCard label="Required By" value={materialRequest.requiredBy ? new Date(materialRequest.requiredBy).toLocaleDateString() : "-"} hint={`Raised ${new Date(materialRequest.requestedAt).toLocaleDateString()}`} />
        <ScmStatCard label="Budget" value={materialRequest.budgetCode || "-"} hint={materialRequest.boqReference || "No BOQ reference"} />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="workflow">Workflow</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <TabsTrigger value="releases">Releases</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle>Request Context</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Purpose</div><p className="mt-2 text-sm whitespace-pre-wrap">{materialRequest.purpose || "-"}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Specification</div><p className="mt-2 text-sm whitespace-pre-wrap">{materialRequest.specification || "-"}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Budget Code</div><p className="mt-2 text-sm">{materialRequest.budgetCode || "-"}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">BOQ Reference</div><p className="mt-2 text-sm">{materialRequest.boqReference || "-"}</p></div>
                  <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Internal Note</div><p className="mt-2 text-sm whitespace-pre-wrap">{materialRequest.note || "-"}</p></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="items">
              <Card>
                <CardHeader><CardTitle>Requested Lines</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Released</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead>Class</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialRequest.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productVariant.product.name}</div>
                            <div className="text-xs text-muted-foreground">{item.productVariant.sku}</div>
                            {item.description ? <div className="text-xs text-muted-foreground">{item.description}</div> : null}
                          </TableCell>
                          <TableCell>{item.quantityRequested}</TableCell>
                          <TableCell>{item.quantityReleased}</TableCell>
                          <TableCell>{Math.max(0, item.quantityRequested - item.quantityReleased)}</TableCell>
                          <TableCell>{item.productVariant.product.inventoryItemClass}{item.productVariant.product.requiresAssetTag ? " • TAG" : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workflow" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Workflow Note</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Input value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} placeholder="Add optional note for your next workflow action" />
                  <p className="text-xs text-muted-foreground">This note will be attached to the next submit, endorsement, approval, rejection, or cancellation action.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Approval Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {materialRequest.approvalEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No workflow actions recorded yet.</p>
                  ) : (
                    materialRequest.approvalEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{toStageLabel(event.stage)} • {toStageLabel(event.decision)}</div>
                          <div className="text-xs text-muted-foreground">{fmtDate(event.actedAt)}</div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">{event.actedBy?.name || event.actedBy?.email || "System"}</div>
                        {event.note ? <p className="mt-2 text-sm">{event.note}</p> : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="attachments">
              <Card>
                <CardHeader><CardTitle>Supporting Documents</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {materialRequest.attachments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No attachments found.</p>
                  ) : (
                    materialRequest.attachments.map((attachment) => (
                      <div key={attachment.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{attachment.fileName}</div>
                          <div className="text-xs text-muted-foreground">{fmtDate(attachment.createdAt)}</div>
                        </div>
                        {attachment.note ? <p className="mt-2 text-sm">{attachment.note}</p> : null}
                        <Button asChild variant="outline" size="sm" className="mt-3">
                          <a href={attachment.fileUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open Attachment
                          </a>
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="releases">
              <Card>
                <CardHeader><CardTitle>Release Notes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {materialRequest.releaseNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No material release has been issued yet.</p>
                  ) : (
                    materialRequest.releaseNotes.map((release) => (
                      <div key={release.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{release.releaseNumber}</div>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/scm/material-releases/${release.id}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open Detail
                            </Link>
                          </Button>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">Released {fmtDate(release.releasedAt)}{release.challanNumber ? ` • Challan ${release.challanNumber}` : ""}{release.waybillNumber ? ` • Waybill ${release.waybillNumber}` : ""}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>People</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Created By</div><div className="mt-1">{materialRequest.createdBy?.name || materialRequest.createdBy?.email || "-"}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Supervisor</div><div className="mt-1">{materialRequest.supervisorEndorsedBy?.name || materialRequest.supervisorEndorsedBy?.email || "-"}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Project Manager</div><div className="mt-1">{materialRequest.projectManagerEndorsedBy?.name || materialRequest.projectManagerEndorsedBy?.email || "-"}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Administration</div><div className="mt-1">{materialRequest.adminApprovedBy?.name || materialRequest.adminApprovedBy?.email || "-"}</div></div>
            </CardContent>
          </Card>

          <ScmNextStepPanel
            title={materialRequest.status}
            subtitle="This panel keeps approval actions visible without sending users back to the register."
            actions={actionButtons.map((button) => ({
              key: button.action,
              label: button.label,
              onClick: () => void runAction(button.action),
              disabled: saving,
              variant: button.action === "reject" || button.action === "cancel" ? "outline" : "default",
            }))}
            emptyMessage="No direct workflow action is available for your current permissions."
          />
        </div>
      </div>
    </div>
  );
}
