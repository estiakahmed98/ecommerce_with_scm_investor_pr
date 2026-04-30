"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Payload = {
  allocation: {
    id: number;
    investorId: number;
    productVariantId: number;
    participationPercent: string | null;
    committedAmount: string | null;
    status: string;
    note: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    investor: {
      id: number;
      code: string;
      name: string;
      status: string;
      kycStatus: string;
    };
    productVariant: {
      id: number;
      sku: string;
      active: boolean;
      product: { id: number; name: string };
    };
    createdBy: { id: string; name: string | null; email: string } | null;
  };
  overlappingAllocations: Array<{
    id: number;
    participationPercent: string | null;
    committedAmount: string | null;
    status: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    investor: {
      id: number;
      code: string;
      name: string;
      status: string;
    };
  }>;
  productVariantAllocationPercent: string;
  investorTransactions: Array<{
    id: number;
    transactionNumber: string;
    transactionDate: string;
    type: string;
    direction: string;
    amount: string;
    currency: string;
  }>;
  relatedProfitLines: Array<{
    id: number;
    allocatedRevenue: string;
    allocatedNetProfit: string;
    participationSharePct: string;
    profitRun: {
      id: number;
      runNumber: string;
      fromDate: string;
      toDate: string;
      status: string;
    };
  }>;
};

function fmtDate(value?: string | null) {
  if (!value) return "Open-ended";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function fmtMoney(value?: string | null) {
  if (!value) return "N/A";
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function InvestorAllocationDetailPage() {
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [status, setStatus] = useState("ACTIVE");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/investor-allocations/${params.id}`, {
        cache: "no-store",
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to load allocation detail.");
      }
      const data = next as Payload;
      setPayload(data);
      setStatus(data.allocation.status);
      setEffectiveTo(data.allocation.effectiveTo ? data.allocation.effectiveTo.slice(0, 10) : "");
      setNote(data.allocation.note ?? "");
    } catch (error: any) {
      toast.error(error?.message || "Failed to load allocation detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) void load();
  }, [params.id]);

  const save = async () => {
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/investor-allocations/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          effectiveTo: effectiveTo || null,
          note,
        }),
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to update allocation.");
      }
      toast.success("Allocation updated.");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update allocation.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !payload) {
    return <div className="p-6 text-sm text-muted-foreground">Loading allocation detail...</div>;
  }

  const { allocation, overlappingAllocations, investorTransactions, relatedProfitLines, productVariantAllocationPercent } = payload;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Allocation #{allocation.id}</h1>
        <p className="text-sm text-muted-foreground">
          Allocation lifecycle, overlap risk, and investor/variant drilldown in one workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Investor</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{allocation.investor.name}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Variant</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{allocation.productVariant.sku}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Participation</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{allocation.participationPercent || "N/A"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Committed</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{fmtMoney(allocation.committedAmount)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Variant Active %</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{productVariantAllocationPercent}</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allocation Context</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Investor</div><Link href={`/admin/investors/${allocation.investor.id}`} className="mt-1 block font-medium hover:text-primary">{allocation.investor.name} ({allocation.investor.code})</Link></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Investor Status</div><div className="mt-1 font-medium">{allocation.investor.status} | {allocation.investor.kycStatus}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Variant</div><div className="mt-1 font-medium">{allocation.productVariant.product.name} ({allocation.productVariant.sku})</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Variant Active</div><div className="mt-1 font-medium">{allocation.productVariant.active ? "Yes" : "No"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Effective From</div><div className="mt-1 font-medium">{fmtDate(allocation.effectiveFrom)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Effective To</div><div className="mt-1 font-medium">{fmtDate(allocation.effectiveTo)}</div></div>
            <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Note</div><div className="mt-1 whitespace-pre-wrap font-medium">{allocation.note || "N/A"}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lifecycle Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Status</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Effective To</Label>
              <Input type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Allocation Changes"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Overlap Risks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overlappingAllocations.length > 0 ? (
              overlappingAllocations.map((item) => (
                <Link key={item.id} href={`/admin/investors/allocations/${item.id}`} className="block rounded-lg border p-3 text-sm hover:border-primary/40 hover:bg-muted/30">
                  <div className="font-medium">{item.investor.name} ({item.investor.code})</div>
                  <div className="text-muted-foreground">
                    {item.status} | {item.participationPercent || "N/A"} | {fmtDate(item.effectiveFrom)} {"->"} {fmtDate(item.effectiveTo)}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No overlapping allocations for this time window.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Linked Ledger Entries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {investorTransactions.length > 0 ? (
              investorTransactions.map((item) => (
                <Link key={item.id} href={`/admin/investors/ledger/${item.id}`} className="block rounded-lg border p-3 text-sm hover:border-primary/40 hover:bg-muted/30">
                  <div className="font-medium">{item.transactionNumber}</div>
                  <div className="text-muted-foreground">
                    {item.type} | {item.direction} | {fmtMoney(item.amount)} {item.currency}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No investor ledger entries linked to this investor/variant pair.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Related Profit Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {relatedProfitLines.length > 0 ? (
            relatedProfitLines.map((item) => (
              <div key={item.id} className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{item.profitRun.runNumber}</div>
                <div className="text-muted-foreground">
                  {fmtDate(item.profitRun.fromDate)} {"->"} {fmtDate(item.profitRun.toDate)} | {item.profitRun.status}
                </div>
                <div className="mt-1 text-muted-foreground">
                  Share {item.participationSharePct}% | Revenue {fmtMoney(item.allocatedRevenue)} | Net Profit {fmtMoney(item.allocatedNetProfit)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No posted allocation history found yet for this investor/variant pair.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
