"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Person = { id: string; name: string | null; email: string };

type Payload = {
  run: {
    id: number;
    runNumber: string;
    fromDate: string;
    toDate: string;
    status: string;
    allocationBasis: string;
    marketingExpense: string;
    adsExpense: string;
    logisticsExpense: string;
    otherExpense: string;
    totalOperatingExpense: string;
    totalNetRevenue: string;
    totalNetCogs: string;
    totalNetProfit: string;
    note: string | null;
    approvedAt: string | null;
    postedAt: string | null;
    postingNote: string | null;
    createdAt: string;
    createdBy: Person | null;
    approvedBy: Person | null;
    postedBy: Person | null;
    _count: { variantLines: number; allocationLines: number; payouts: number };
    variantLines: Array<{
      id: number;
      netRevenue: string;
      netCogs: string;
      allocatedExpense: string;
      netProfit: string;
      unallocatedSharePct: string;
      unitsNet: number;
      productVariant: { id: number; sku: string; product: { id: number; name: string } };
    }>;
    allocationLines: Array<{
      id: number;
      participationSharePct: string;
      allocatedRevenue: string;
      allocatedNetProfit: string;
      investor: { id: number; code: string; name: string; status: string };
      productVariant: { id: number; sku: string; product: { id: number; name: string } };
      sourceAllocation: { id: number; status: string; effectiveFrom: string; effectiveTo: string | null } | null;
    }>;
    payouts: Array<{
      id: number;
      payoutNumber: string;
      payoutAmount: string;
      status: string;
      paidAt: string | null;
      investor: { id: number; code: string; name: string };
      transaction: { id: number; transactionNumber: string; transactionDate: string; amount: string } | null;
    }>;
  };
  governance: {
    variantLineCount: number;
    allocationLineCount: number;
    variantsWithUnallocatedCount: number;
    unallocatedShareTotal: string;
    companyRetainedRevenueTotal: string;
    companyRetainedProfitTotal: string;
    missingSourceAllocationCount: number;
    inactiveSourceAllocationCount: number;
    negativeDistributionCount: number;
    nonBlockingWarnings: string[];
    blockingIssues: string[];
  };
  recentActivity: Array<{
    id: string;
    action: string;
    entity: string;
    createdAt: string;
    actorName: string | null;
    actorEmail: string | null;
    metadata?: { message?: string } | null;
  }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function fmtMoney(value: string) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function InvestorProfitRunDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canApprove = permissions.includes("investor_profit.approve");
  const canPost = permissions.includes("investor_profit.post");

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [workflowNote, setWorkflowNote] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/investor-profit-runs/${params.id}`, {
        cache: "no-store",
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to load investor profit run.");
      }
      setPayload(next as Payload);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor profit run.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) void load();
  }, [params.id]);

  const act = async (action: "approve" | "reject" | "post") => {
    try {
      setActing(true);
      const response = await fetch(
        action === "post"
          ? `/api/admin/investor-profit-runs/${params.id}/post`
          : `/api/admin/investor-profit-runs/${params.id}`,
        {
          method: action === "post" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "post"
              ? { note: workflowNote }
              : { action, note: workflowNote },
          ),
        },
      );
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to update investor profit run.");
      }
      toast.success(
        action === "post"
          ? "Profit run posted to investor ledger."
          : action === "approve"
            ? "Profit run approved."
            : "Profit run rejected.",
      );
      setWorkflowNote("");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update investor profit run.");
    } finally {
      setActing(false);
    }
  };

  if (loading || !payload) {
    return <div className="p-6 text-sm text-muted-foreground">Loading profit run detail...</div>;
  }

  const { run, governance, recentActivity } = payload;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{run.runNumber}</h1>
        <p className="text-sm text-muted-foreground">
          Investor profit governance workspace with blocking issues, approval controls, and posting readiness.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(run.totalNetProfit)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Run Status</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{run.status}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Variants</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{run._count.variantLines}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Allocations</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{run._count.allocationLines}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Warnings</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{governance.nonBlockingWarnings.length}</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Period</div><div className="mt-1 font-medium">{fmtDate(run.fromDate)} - {fmtDate(run.toDate)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Allocation Basis</div><div className="mt-1 font-medium">{run.allocationBasis}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Net Revenue</div><div className="mt-1 font-medium">{fmtMoney(run.totalNetRevenue)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Net COGS</div><div className="mt-1 font-medium">{fmtMoney(run.totalNetCogs)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Operating Expense</div><div className="mt-1 font-medium">{fmtMoney(run.totalOperatingExpense)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Created By</div><div className="mt-1 font-medium">{run.createdBy?.name || run.createdBy?.email || "System"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Approved</div><div className="mt-1 font-medium">{run.approvedAt ? `${fmtDate(run.approvedAt)} by ${run.approvedBy?.name || run.approvedBy?.email || "Unknown"}` : "N/A"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Posted</div><div className="mt-1 font-medium">{run.postedAt ? `${fmtDate(run.postedAt)} by ${run.postedBy?.name || run.postedBy?.email || "Unknown"}` : "N/A"}</div></div>
            <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Run Note</div><div className="mt-1 whitespace-pre-wrap font-medium">{run.note || "N/A"}</div></div>
            <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Posting Note</div><div className="mt-1 whitespace-pre-wrap font-medium">{run.postingNote || "N/A"}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Governance Checks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Variants With Company Retained Share</div><div className="mt-1 font-medium">{governance.variantsWithUnallocatedCount}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Company Retained Share Total</div><div className="mt-1 font-medium">{(Number(governance.unallocatedShareTotal) * 100).toFixed(2)}%</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Company Retained Revenue</div><div className="mt-1 font-medium">{fmtMoney(governance.companyRetainedRevenueTotal)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Company Retained Profit</div><div className="mt-1 font-medium">{fmtMoney(governance.companyRetainedProfitTotal)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Missing Source Allocation</div><div className="mt-1 font-medium">{governance.missingSourceAllocationCount}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Inactive Source Allocation</div><div className="mt-1 font-medium">{governance.inactiveSourceAllocationCount}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Negative Distribution Lines</div><div className="mt-1 font-medium">{governance.negativeDistributionCount}</div></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {governance.blockingIssues.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-medium">Posting/approval blockers</div>
              <ul className="mt-2 list-disc pl-5">
                {governance.blockingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : governance.nonBlockingWarnings.length > 0 ? (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="font-medium">Controlled warnings</div>
              <ul className="mt-2 list-disc pl-5">
                {governance.nonBlockingWarnings.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              Run passed the current governance checks.
            </div>
          )}
          <div className="space-y-1">
            <Label>Workflow Note</Label>
            <Input value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} placeholder="Required for reject/post. Optional for approve." />
          </div>
          <div className="flex flex-wrap gap-2">
            {canApprove && run.status === "PENDING_APPROVAL" ? (
              <>
                <Button onClick={() => void act("approve")} disabled={acting || governance.blockingIssues.length > 0}>
                  {acting ? "Working..." : "Approve Run"}
                </Button>
                <Button variant="outline" onClick={() => void act("reject")} disabled={acting}>
                  {acting ? "Working..." : "Reject Run"}
                </Button>
              </>
            ) : null}
            {canPost && run.status === "APPROVED" ? (
              <Button onClick={() => void act("post")} disabled={acting || governance.blockingIssues.length > 0}>
                {acting ? "Working..." : "Post To Investor Ledger"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="variants" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="variants">Variants</TabsTrigger>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="variants" className="space-y-3">
          {run.variantLines.map((line) => (
            <div key={line.id} className="rounded-lg border p-4 text-sm">
              <div className="font-medium">{line.productVariant.product.name} ({line.productVariant.sku})</div>
              <div className="mt-1 text-muted-foreground">
                Units {line.unitsNet} | Revenue {fmtMoney(line.netRevenue)} | COGS {fmtMoney(line.netCogs)} | Expense {fmtMoney(line.allocatedExpense)} | Profit {fmtMoney(line.netProfit)} | Company Retained Share {(Number(line.unallocatedSharePct) * 100).toFixed(2)}%
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="allocations" className="space-y-3">
          {run.allocationLines.map((line) => (
            <div key={line.id} className="rounded-lg border p-4 text-sm">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div className="font-medium">
                  <Link href={`/admin/investors/${line.investor.id}`} className="hover:text-primary">
                    {line.investor.name} ({line.investor.code})
                  </Link>
                </div>
                {line.sourceAllocation ? (
                  <Link href={`/admin/investors/allocations/${line.sourceAllocation.id}`} className="text-muted-foreground hover:text-primary">
                    Source Allocation #{line.sourceAllocation.id}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No source allocation</span>
                )}
              </div>
              <div className="mt-1 text-muted-foreground">
                {line.productVariant.product.name} ({line.productVariant.sku}) | Share {(Number(line.participationSharePct) * 100).toFixed(2)}% | Revenue {fmtMoney(line.allocatedRevenue)} | Net Profit {fmtMoney(line.allocatedNetProfit)}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="payouts" className="space-y-3">
          {run.payouts.length > 0 ? (
            run.payouts.map((item) => (
              <div key={item.id} className="rounded-lg border p-4 text-sm">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="font-medium">{item.payoutNumber}</div>
                  <div className="text-muted-foreground">{item.status}</div>
                </div>
                <div className="mt-1 text-muted-foreground">
                  <Link href={`/admin/investors/${item.investor.id}`} className="hover:text-primary">
                    {item.investor.name} ({item.investor.code})
                  </Link>{" "}
                  | Amount {fmtMoney(item.payoutAmount)} | Paid {fmtDate(item.paidAt)}
                </div>
                {item.transaction ? (
                  <div className="mt-1 text-muted-foreground">
                    Ledger: <Link href={`/admin/investors/ledger/${item.transaction.id}`} className="hover:text-primary">{item.transaction.transactionNumber}</Link>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No payout drafts created from this run yet.
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-3">
          {recentActivity.length > 0 ? (
            recentActivity.map((item) => (
              <div key={item.id} className="rounded-lg border p-4 text-sm">
                <div className="font-medium">{item.metadata?.message || `${item.action} ${item.entity}`}</div>
                <div className="mt-1 text-muted-foreground">
                  {item.actorName || item.actorEmail || "System"} | {fmtDate(item.createdAt)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No recent activity logged for this run.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
