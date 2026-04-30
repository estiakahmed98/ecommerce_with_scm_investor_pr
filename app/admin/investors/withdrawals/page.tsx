"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvestorWorkflowGuide } from "@/components/investors/InvestorWorkflowGuide";

type WithdrawalRow = {
  id: number;
  requestNumber: string;
  requestedAmount: string;
  approvedAmount: string | null;
  currency: string;
  availableBalanceSnapshot: string;
  activeCommittedAmountSnapshot: string;
  pendingPayoutAmountSnapshot: string;
  withdrawableBalanceSnapshot: string;
  status: string;
  requestedSettlementDate: string | null;
  requestNote: string | null;
  reviewNote: string | null;
  rejectionReason: string | null;
  settlementNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  settledAt: string | null;
  investor: {
    id: number;
    code: string;
    name: string;
    status?: string;
    kycStatus?: string;
  } | null;
  submittedBy: { id: string; name: string | null; email: string } | null;
  reviewedBy: { id: string; name: string | null; email: string } | null;
  settledBy: { id: string; name: string | null; email: string } | null;
  transaction: {
    id: number;
    transactionNumber: string;
    transactionDate: string;
    amount: string;
    direction: string;
    type: string;
  } | null;
};

type Payload = {
  summary: {
    requested: number;
    approved: number;
    settled: number;
    rejected: number;
    totalRequestedAmount: string;
  };
  rows: WithdrawalRow[];
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

export default function InvestorWithdrawalsPage() {
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [status, setStatus] = useState("REQUESTED");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [approvedAmounts, setApprovedAmounts] = useState<Record<number, string>>({});
  const [settlementNotes, setSettlementNotes] = useState<Record<number, string>>({});

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(
        `/api/admin/investor-withdrawals${params.size ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load investor withdrawals.");
      }
      setData(payload as Payload);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor withdrawals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const act = async (
    row: WithdrawalRow,
    action: "approve" | "reject" | "settle",
  ) => {
    try {
      setWorkingId(row.id);
      const response = await fetch(`/api/admin/investor-withdrawals/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewNote: reviewNotes[row.id] || "",
          approvedAmount: approvedAmounts[row.id] || row.requestedAmount,
          settlementNote: settlementNotes[row.id] || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update investor withdrawal.");
      }
      toast.success(
        action === "approve"
          ? "Withdrawal request approved."
          : action === "reject"
            ? "Withdrawal request rejected."
            : "Withdrawal request settled.",
      );
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update investor withdrawal.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <InvestorWorkflowGuide currentSection="withdrawals" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Investor Withdrawals</h1>
          <p className="text-sm text-muted-foreground">
            Review, approve, and settle capital withdrawal requests with balance controls.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search investor or request"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56"
          />
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Requested</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.requested ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.approved ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Settled</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.settled ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.rejected ?? 0}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Requested</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.summary.totalRequestedAmount ?? "0"}</CardContent></Card>
      </div>

      <div className="flex gap-2">
        {["REQUESTED", "APPROVED", "SETTLED", "REJECTED", ""].map((value) => (
          <Button
            key={value || "ALL"}
            variant={status === value ? "default" : "outline"}
            onClick={() => setStatus(value)}
          >
            {value || "ALL"}
          </Button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading withdrawals...</p> : null}

      {!loading && data ? (
        <div className="space-y-4">
          {data.rows.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No investor withdrawal requests found.
              </CardContent>
            </Card>
          ) : (
            data.rows.map((row) => (
              <Card key={row.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{row.requestNumber}</CardTitle>
                        <Badge variant="outline">{row.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.investor?.name} ({row.investor?.code}) | Submitted {fmtDate(row.submittedAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {row.investor ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/investors/${row.investor.id}`}>Open Investor</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border p-3 text-sm">
                      <div className="text-muted-foreground">Requested</div>
                      <div className="font-semibold">{row.requestedAmount} {row.currency}</div>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <div className="text-muted-foreground">Withdrawable Snapshot</div>
                      <div className="font-semibold">{row.withdrawableBalanceSnapshot}</div>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <div className="text-muted-foreground">Active Committed Snapshot</div>
                      <div className="font-semibold">{row.activeCommittedAmountSnapshot}</div>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <div className="text-muted-foreground">Pending Payout Snapshot</div>
                      <div className="font-semibold">{row.pendingPayoutAmountSnapshot}</div>
                    </div>
                  </div>

                  {row.requestNote ? <p className="text-sm">Request note: {row.requestNote}</p> : null}
                  {row.reviewNote ? <p className="text-sm text-muted-foreground">Review note: {row.reviewNote}</p> : null}
                  {row.rejectionReason ? <p className="text-sm text-destructive">Rejection reason: {row.rejectionReason}</p> : null}
                  {row.settlementNote ? <p className="text-sm text-muted-foreground">Settlement note: {row.settlementNote}</p> : null}
                  {row.transaction ? (
                    <p className="text-sm text-muted-foreground">
                      Posted to ledger as {row.transaction.transactionNumber} on {fmtDate(row.transaction.transactionDate)}.
                    </p>
                  ) : null}

                  {row.status === "REQUESTED" ? (
                    <div className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Approved Amount</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={approvedAmounts[row.id] ?? row.requestedAmount}
                          onChange={(event) =>
                            setApprovedAmounts((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Review Note</Label>
                        <Textarea
                          value={reviewNotes[row.id] || ""}
                          onChange={(event) =>
                            setReviewNotes((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex gap-2 md:col-span-2">
                        <Button
                          size="sm"
                          onClick={() => void act(row, "approve")}
                          disabled={workingId === row.id}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void act(row, "reject")}
                          disabled={workingId === row.id}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {row.status === "APPROVED" ? (
                    <div className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label>Settlement Note</Label>
                        <Textarea
                          value={settlementNotes[row.id] || ""}
                          onChange={(event) =>
                            setSettlementNotes((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                          placeholder="Bank reference, proof reference, or settlement comment."
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Button
                          size="sm"
                          onClick={() => void act(row, "settle")}
                          disabled={workingId === row.id}
                        >
                          Settle Withdrawal
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
