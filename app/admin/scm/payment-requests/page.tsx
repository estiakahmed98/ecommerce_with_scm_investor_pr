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

type Warehouse = { id: number; name: string; code: string };
type Supplier = { id: number; name: string; code: string; currency?: string | null };
type PurchaseOrder = { id: number; poNumber: string; supplierId: number };
type GoodsReceipt = { id: number; receiptNumber: string; purchaseOrderId: number };
type SupplierInvoice = { id: number; invoiceNumber: string; total: number | string; status: string };
type ComparativeStatement = { id: number; csNumber: string };

type PaymentRequest = {
  id: number;
  prfNumber: string;
  status: string;
  approvalStage: string;
  amount: string | number;
  currency: string;
  requestedAt: string;
  supplier: Supplier;
  warehouse?: Warehouse | null;
  purchaseOrder?: PurchaseOrder | null;
  goodsReceipt?: GoodsReceipt | null;
  supplierInvoice?: SupplierInvoice | null;
  comparativeStatement?: ComparativeStatement | null;
};

async function readJson<T>(res: Response, errorMessage: string) {
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { error?: string }).error || errorMessage);
  }
  return (await res.json()) as T;
}

export default function PaymentRequestsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canRead = permissions.some((perm) =>
    [
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
    ].includes(perm),
  );
  const canManage = permissions.includes("payment_requests.manage");

  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [search, setSearch] = useState(searchParams.get("search") || "");

  useEffect(() => {
    setStatusFilter(searchParams.get("status") || "");
    setSearch(searchParams.get("search") || "");
  }, [searchParams]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (search.trim()) qs.set("search", search.trim());
      const res = await fetch(`/api/scm/payment-requests?${qs.toString()}`, { cache: "no-store" });
      const data = await readJson<PaymentRequest[]>(res, "Failed to load payment requests");
      setRequests(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load payment requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canRead) return;
    void loadRequests();
  }, [canRead, statusFilter]);

  const summary = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((row) => ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(row.status)).length,
      paid: requests.filter((row) => row.status === "PAID").length,
      blocked: requests.filter((row) => ["REJECTED", "CANCELLED"].includes(row.status)).length,
    };
  }, [requests]);

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You do not have permission to access payment requests.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payment Requests (PRF)</h1>
          <p className="text-sm text-muted-foreground">
            Browse the PRF queue here. Draft creation and treasury actions are handled in dedicated workspaces.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage ? (
            <Button asChild>
              <Link href="/admin/scm/payment-requests/new">
                <Plus className="mr-2 h-4 w-4" />
                New PRF
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void loadRequests()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Total" value={String(summary.total)} hint="Visible payment requests" />
        <ScmStatCard label="In Workflow" value={String(summary.pending)} hint="Submitted through treasury processing" />
        <ScmStatCard label="Paid" value={String(summary.paid)} hint="Completed settlements" />
        <ScmStatCard label="Blocked" value={String(summary.blocked)} hint="Rejected or cancelled" />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>PRF Register</CardTitle>
            <p className="text-sm text-muted-foreground">
              Register-first view. Open the detail page for approvals, treasury actions, and full linked document context.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PRF, supplier, invoice..." className="w-full md:w-80" />
            <select className="w-full rounded-md border bg-background px-3 py-2 md:w-56" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="MANAGER_APPROVED">Manager Approved</option>
              <option value="FINANCE_APPROVED">Finance Approved</option>
              <option value="TREASURY_PROCESSING">Treasury Processing</option>
              <option value="PAID">Paid</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading payment requests...</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment requests found.</p>
          ) : (
            <div className="space-y-4">
              {requests.map((row) => (
                <div key={row.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/scm/payment-requests/${row.id}`} className="text-lg font-semibold underline-offset-4 hover:underline">
                          {row.prfNumber}
                        </Link>
                        <ScmStatusChip status={row.status} />
                      </div>
                      <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                        <div>Supplier: {row.supplier.name}</div>
                        <div>Warehouse: {row.warehouse?.name || "-"}</div>
                        <div>Invoice: {row.supplierInvoice?.invoiceNumber || "-"}</div>
                        <div>Requested: {new Date(row.requestedAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/admin/scm/payment-requests/${row.id}`}>Open Detail</Link>
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
