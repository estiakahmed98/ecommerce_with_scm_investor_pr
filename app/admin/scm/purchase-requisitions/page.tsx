"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type Supplier = {
  id: number;
  name: string;
  code: string;
};

type PurchaseRequisition = {
  id: number;
  requisitionNumber: string;
  status: string;
  planningNote?: string | null;
  title: string | null;
  purpose: string | null;
  budgetCode: string | null;
  estimatedAmount: string | null;
  requestedAt: string;
  neededBy: string | null;
  endorsementRequiredCount: number;
  warehouse: Warehouse;
  purchaseOrders: Array<{
    id: number;
    poNumber: string;
    status: string;
    supplier: Supplier;
  }>;
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

export default function PurchaseRequisitionsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];

  const canManage = permissions.includes("purchase_requisitions.manage");

  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "ALL");

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
    setStatusFilter(searchParams.get("status") || "ALL");
  }, [searchParams]);

  const loadRequisitions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/scm/purchase-requisitions?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await readJson<PurchaseRequisition[]>(
        response,
        "Failed to load purchase requisitions",
      );
      setRequisitions(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load purchase requisitions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequisitions();
  }, [statusFilter]);

  const visibleRequisitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return requisitions;
    return requisitions.filter((requisition) => {
      return (
        requisition.requisitionNumber.toLowerCase().includes(query) ||
        requisition.planningNote?.toLowerCase().includes(query) ||
        requisition.title?.toLowerCase().includes(query) ||
        requisition.purpose?.toLowerCase().includes(query) ||
        requisition.warehouse.name.toLowerCase().includes(query) ||
        requisition.budgetCode?.toLowerCase().includes(query)
      );
    });
  }, [requisitions, search]);

  const summary = useMemo(() => {
    return {
      total: requisitions.length,
      pending: requisitions.filter((row) =>
        ["SUBMITTED", "BUDGET_CLEARED", "ENDORSED"].includes(row.status),
      ).length,
      approved: requisitions.filter((row) => row.status === "APPROVED").length,
      converted: requisitions.filter((row) => row.purchaseOrders.length > 0).length,
    };
  }, [requisitions]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Requisitions</h1>
          <p className="text-sm text-muted-foreground">
            Browse requisitions, filter backlog, and move into detail workspaces for approvals or conversion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button asChild>
              <Link href="/admin/scm/purchase-requisitions/new">
                <Plus className="mr-2 h-4 w-4" />
                New Requisition
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void loadRequisitions()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Total" value={String(summary.total)} hint="Visible requisitions" />
        <ScmStatCard label="Pending Approval" value={String(summary.pending)} hint="Submitted, budget-cleared, endorsed" />
        <ScmStatCard label="Approved" value={String(summary.approved)} hint="Ready for sourcing or conversion" />
        <ScmStatCard label="Converted" value={String(summary.converted)} hint="Already linked to purchase orders" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Requisition Register</CardTitle>
            <p className="text-sm text-muted-foreground">
              This screen is now queue-focused. Create, approvals, and conversion happen in dedicated workspaces.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search requisition, title, warehouse, budget..."
              className="w-full md:w-80"
            />
            <select
              className="w-full rounded-md border bg-background px-3 py-2 md:w-56"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="BUDGET_CLEARED">Budget Cleared</option>
              <option value="ENDORSED">Endorsed</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CONVERTED">Converted</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading purchase requisitions...</p>
          ) : visibleRequisitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase requisitions found.</p>
          ) : (
            <div className="space-y-4">
              {visibleRequisitions.map((requisition) => (
                <div key={requisition.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/scm/purchase-requisitions/${requisition.id}`}
                          className="text-lg font-semibold underline-offset-4 hover:underline"
                        >
                          {requisition.requisitionNumber}
                        </Link>
                        <ScmStatusChip status={requisition.status} />
                      </div>
                      {requisition.title ? <div className="text-sm font-medium">{requisition.title}</div> : null}
                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                        <div>Warehouse: {requisition.warehouse.name}</div>
                        <div>Budget: {requisition.budgetCode || "-"}</div>
                        <div>Needed By: {requisition.neededBy ? new Date(requisition.neededBy).toLocaleDateString() : "-"}</div>
                        <div>PO Links: {requisition.purchaseOrders.length}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/admin/scm/purchase-requisitions/${requisition.id}`}>
                          Open Detail
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
