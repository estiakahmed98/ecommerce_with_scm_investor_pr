"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Warehouse = { id: number; name: string; code: string };
type Variant = { id: number; sku: string; product?: { id: number; name: string } };
type UserRow = { id: string; name: string | null; email: string | null };
type Bin = { id: number; code: string; name: string };

type VerificationLine = {
  id: number;
  systemQty: number;
  countedQty: number;
  variance: number;
  note: string | null;
  productVariant: { id: number; sku: string; product: { id: number; name: string } };
  bin?: { id: number; code: string; name: string } | null;
};

type Verification = {
  id: number;
  status: "DRAFT" | "SUBMITTED" | "COMMITTEE_REVIEW" | "APPROVED" | "REJECTED" | "CLOSED";
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  periodStart: string;
  periodEnd: string;
  note: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  warehouse: Warehouse;
  createdBy?: { id: string; name: string | null; email: string | null } | null;
  approvedBy?: { id: string; name: string | null; email: string | null } | null;
  committeeMembers: Array<{ id: number; user: UserRow }>;
  lines: VerificationLine[];
  approvalEvents: Array<{
    id: number;
    stage: string;
    decision: string;
    note: string | null;
    actedAt: string;
    actedBy?: { id: string; name: string | null; email: string | null } | null;
  }>;
};

async function readJson<T>(res: Response, errorMessage: string) {
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || errorMessage);
  }
  return (await res.json()) as T;
}

export default function PhysicalVerificationsPage() {
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canRead = permissions.includes("physical_verifications.read") || permissions.includes("physical_verifications.manage") || permissions.includes("physical_verifications.approve");
  const canManage = permissions.includes("physical_verifications.manage");
  const canApprove = permissions.includes("physical_verifications.approve");

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    warehouseId: "",
    frequency: "MONTHLY",
    periodStart: "",
    periodEnd: "",
    note: "",
    committeeUserIds: [] as string[],
  });
  const [lines, setLines] = useState(
    [] as Array<{
      productVariantId: string;
      binId: string;
      systemQty: string;
      countedQty: string;
      note: string;
    }>,
  );

  const selectedWarehouseId = Number(form.warehouseId || warehouseId);

  const loadBootstrap = async () => {
    setLoading(true);
    try {
      const [warehouseRes, variantRes] = await Promise.all([
        fetch("/api/warehouses", { cache: "no-store" }),
        fetch("/api/product-variants", { cache: "no-store" }),
      ]);
      const [warehouseData, variantData] = await Promise.all([
        readJson<Warehouse[]>(warehouseRes, "Failed to load warehouses"),
        readJson<Variant[]>(variantRes, "Failed to load variants"),
      ]);
      setWarehouses(warehouseData);
      setVariants(variantData);
      if (!warehouseId && warehouseData.length > 0) {
        setWarehouseId(String(warehouseData[0].id));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load setup data");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/users?limit=50", { cache: "no-store" });
      const data = await readJson<{ users: UserRow[] }>(res, "Failed to load users");
      setUsers(data.users || []);
    } catch {
      setUsers([]);
    }
  };

  const loadBins = async (targetWarehouseId: number) => {
    if (!targetWarehouseId) return;
    const res = await fetch(`/api/scm/warehouse-locations?warehouseId=${targetWarehouseId}`, {
      cache: "no-store",
    });
    const data = await readJson<{ bins: Bin[] }>(res, "Failed to load bins");
    setBins(data.bins || []);
  };

  const loadVerifications = async () => {
    const qs = new URLSearchParams();
    if (warehouseId) qs.set("warehouseId", warehouseId);
    if (statusFilter) qs.set("status", statusFilter);
    const res = await fetch(`/api/scm/physical-verifications?${qs.toString()}`, {
      cache: "no-store",
    });
    const data = await readJson<Verification[]>(res, "Failed to load verifications");
    setVerifications(data);
  };

  useEffect(() => {
    void loadBootstrap();
    if (canRead) {
      void loadVerifications();
    }
    if (canManage || canApprove) {
      void loadUsers();
    }
  }, []);

  useEffect(() => {
    if (!selectedWarehouseId) return;
    void loadBins(selectedWarehouseId);
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!canRead) return;
    void loadVerifications();
  }, [warehouseId, statusFilter, canRead]);

  const addLine = () => {
    setLines((current) => [
      ...current,
      { productVariantId: "", binId: "", systemQty: "", countedQty: "", note: "" },
    ]);
  };

  const updateLine = (index: number, key: string, value: string) => {
    setLines((current) =>
      current.map((line, idx) => (idx === index ? { ...line, [key]: value } : line)),
    );
  };

  const removeLine = (index: number) => {
    setLines((current) => current.filter((_, idx) => idx !== index));
  };

  const toggleCommitteeMember = (userId: string) => {
    setForm((current) => {
      const exists = current.committeeUserIds.includes(userId);
      return {
        ...current,
        committeeUserIds: exists
          ? current.committeeUserIds.filter((id) => id !== userId)
          : [...current.committeeUserIds, userId],
      };
    });
  };

  const createVerification = async () => {
    if (!form.warehouseId || !form.periodStart || !form.periodEnd) {
      toast.error("Warehouse and period dates are required.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one counted line.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/scm/physical-verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: Number(form.warehouseId),
          frequency: form.frequency,
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          note: form.note,
          committeeUserIds: form.committeeUserIds,
          lines: lines.map((line) => ({
            productVariantId: Number(line.productVariantId),
            binId: line.binId ? Number(line.binId) : null,
            systemQty: Number(line.systemQty || 0),
            countedQty: Number(line.countedQty || 0),
            note: line.note,
          })),
        }),
      });
      await readJson(res, "Failed to create verification");
      toast.success("Verification created");
      setForm({
        warehouseId: "",
        frequency: "MONTHLY",
        periodStart: "",
        periodEnd: "",
        note: "",
        committeeUserIds: [],
      });
      setLines([]);
      await loadVerifications();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create verification");
    } finally {
      setCreating(false);
    }
  };

  const runAction = async (id: number, action: string) => {
    try {
      const res = await fetch(`/api/scm/physical-verifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await readJson(res, "Failed to update verification");
      toast.success("Verification updated");
      await loadVerifications();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update verification");
    }
  };

  const visibleUsers = useMemo(() => users.slice(0, 12), [users]);

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You do not have permission to access physical verifications.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Physical Verification</h1>
          <p className="text-sm text-muted-foreground">
            Schedule warehouse verification cycles, capture counts, and approve variance outcomes.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadVerifications()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Verification Cycle</CardTitle>
            <CardDescription>Capture counted stock for a verification period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[220px_180px_180px_1fr]">
              <div className="space-y-2">
                <Label>Warehouse</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={form.warehouseId}
                  onChange={(e) => setForm((cur) => ({ ...cur, warehouseId: e.target.value }))}
                >
                  <option value="">Select warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={form.frequency}
                  onChange={(e) => setForm((cur) => ({ ...cur, frequency: e.target.value }))}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm((cur) => ({ ...cur, periodStart: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm((cur) => ({ ...cur, periodEnd: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
              <div className="space-y-2">
                <Label>Committee Members</Label>
                <div className="flex flex-wrap gap-2">
                  {visibleUsers.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No users available.</div>
                  ) : (
                    visibleUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs ${
                          form.committeeUserIds.includes(user.id)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                        onClick={() => toggleCommitteeMember(user.id)}
                      >
                        {user.name || user.email || user.id.slice(0, 6)}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={form.note}
                  onChange={(e) => setForm((cur) => ({ ...cur, note: e.target.value }))}
                  placeholder="Optional verification note"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Counted Lines</Label>
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4" />
                  Add line
                </Button>
              </div>
              {lines.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Add counted lines to record verification results.
                </div>
              ) : (
                <div className="space-y-2">
                  {lines.map((line, index) => (
                    <div
                      key={`line-${index}`}
                      className="grid gap-2 md:grid-cols-[2fr_1.2fr_120px_120px_1fr_auto]"
                    >
                      <select
                        className="rounded-md border bg-background px-3 py-2"
                        value={line.productVariantId}
                        onChange={(e) => updateLine(index, "productVariantId", e.target.value)}
                      >
                        <option value="">Variant</option>
                        {variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.product?.name || "Variant"} ({variant.sku})
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded-md border bg-background px-3 py-2"
                        value={line.binId}
                        onChange={(e) => updateLine(index, "binId", e.target.value)}
                      >
                        <option value="">Bin (optional)</option>
                        {bins.map((bin) => (
                          <option key={bin.id} value={bin.id}>
                            {bin.code} · {bin.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        placeholder="System qty"
                        value={line.systemQty}
                        onChange={(e) => updateLine(index, "systemQty", e.target.value)}
                      />
                      <Input
                        placeholder="Counted qty"
                        value={line.countedQty}
                        onChange={(e) => updateLine(index, "countedQty", e.target.value)}
                      />
                      <Input
                        placeholder="Note"
                        value={line.note}
                        onChange={(e) => updateLine(index, "note", e.target.value)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeLine(index)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={() => void createVerification()} disabled={creating}>
              Create Verification
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Verification Register</CardTitle>
          <CardDescription>Monitor verification status and approvals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <select
              className="rounded-md border bg-background px-3 py-2"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border bg-background px-3 py-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="COMMITTEE_REVIEW">Committee review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lines</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {verifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No verifications found.
                  </TableCell>
                </TableRow>
              ) : (
                verifications.map((verification) => (
                  <TableRow key={verification.id}>
                    <TableCell>
                      <div className="font-medium">{verification.warehouse.name}</div>
                      <div className="text-xs text-muted-foreground">{verification.warehouse.code}</div>
                    </TableCell>
                    <TableCell>
                      {new Date(verification.periodStart).toLocaleDateString()} →{" "}
                      {new Date(verification.periodEnd).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{verification.status.replaceAll("_", " ")}</TableCell>
                    <TableCell>{verification.lines.length}</TableCell>
                    <TableCell>
                        <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/scm/physical-verifications/${verification.id}`}>Open Detail</Link>
                        </Button>
                        {canManage && verification.status === "DRAFT" ? (
                          <Button size="sm" onClick={() => void runAction(verification.id, "submit")}>
                            Submit
                          </Button>
                        ) : null}
                        {canApprove && verification.status === "SUBMITTED" ? (
                          <Button size="sm" variant="outline" onClick={() => void runAction(verification.id, "committee_review")}>
                            Committee Review
                          </Button>
                        ) : null}
                        {canApprove && verification.status === "COMMITTEE_REVIEW" ? (
                          <>
                            <Button size="sm" onClick={() => void runAction(verification.id, "committee_approve")}>
                              Committee Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => void runAction(verification.id, "committee_reject")}>
                              Reject
                            </Button>
                          </>
                        ) : null}
                        {canApprove && ["SUBMITTED", "COMMITTEE_REVIEW"].includes(verification.status) ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => void runAction(verification.id, "admin_approve")}>
                              Final Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => void runAction(verification.id, "admin_reject")}>
                              Final Reject
                            </Button>
                          </>
                        ) : null}
                        {canApprove && verification.status === "APPROVED" ? (
                          <Button size="sm" variant="outline" onClick={() => void runAction(verification.id, "close")}>
                            Close
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
