"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type WithdrawalRequestRow = {
  id: number;
  requestNumber: string;
  requestedAmount: string;
  approvedAmount: string | null;
  currency: string;
  status: string;
  requestedSettlementDate: string | null;
  requestNote: string | null;
  reviewNote: string | null;
  rejectionReason: string | null;
  settlementNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  settledAt: string | null;
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
  investor: {
    id: number;
    code: string;
    name: string;
    status: string;
    kycStatus: string;
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    beneficiaryVerifiedAt: string | null;
    beneficiaryVerificationNote: string | null;
  };
  metrics: {
    availableBalance: string;
    activeCommittedAmount: string;
    pendingPayoutAmount: string;
    pendingWithdrawalAmount: string;
    withdrawableBalance: string;
  };
  requests: WithdrawalRequestRow[];
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export default function InvestorWithdrawalsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [amount, setAmount] = useState("");
  const [requestedSettlementDate, setRequestedSettlementDate] = useState("");
  const [requestNote, setRequestNote] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/investor/withdrawals", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load withdrawal center.");
      }
      setData(payload as Payload);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load withdrawal center.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    try {
      setSaving(true);
      const response = await fetch("/api/investor/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          requestedSettlementDate: requestedSettlementDate || null,
          requestNote: requestNote || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit withdrawal request.");
      }
      toast.success("Withdrawal request submitted.");
      setAmount("");
      setRequestedSettlementDate("");
      setRequestNote("");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit withdrawal request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Withdrawal Center</h1>
        <p className="text-sm text-muted-foreground">
          Review withdrawable balance, submit requests, and track approval and settlement.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading withdrawal center...</p> : null}

      {!loading && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Available Balance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.metrics.availableBalance}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Committed</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.metrics.activeCommittedAmount}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Payouts</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.metrics.pendingPayoutAmount}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Withdrawals</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.metrics.pendingWithdrawalAmount}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Withdrawable</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.metrics.withdrawableBalance}</CardContent></Card>
          </div>

          {data.investor.kycStatus !== "VERIFIED" || !data.investor.beneficiaryVerifiedAt ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Withdrawal requests require VERIFIED KYC and a verified beneficiary account.
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit Withdrawal Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <Label>Requested Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Requested Settlement Date</Label>
                  <Input
                    type="date"
                    value={requestedSettlementDate}
                    onChange={(event) => setRequestedSettlementDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Beneficiary</Label>
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {(data.investor.bankAccountName || data.investor.name) + " | " + (data.investor.bankName || "No Bank")}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Request Note</Label>
                <Textarea
                  value={requestNote}
                  onChange={(event) => setRequestNote(event.target.value)}
                  placeholder="Explain why the withdrawal is needed or any settlement instruction."
                />
              </div>
              <Button onClick={() => void submit()} disabled={saving}>
                {saving ? "Submitting..." : "Submit Withdrawal Request"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Withdrawal Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No withdrawal requests found.</p>
              ) : (
                data.requests.map((row) => (
                  <div key={row.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{row.requestNumber}</p>
                          <Badge variant="outline">{row.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Submitted {fmtDate(row.submittedAt)} | Requested {row.requestedAmount} {row.currency}
                        </p>
                      </div>
                      {row.transaction ? (
                        <div className="text-right text-sm text-muted-foreground">
                          <div>{row.transaction.transactionNumber}</div>
                          <div>{fmtDate(row.transaction.transactionDate)}</div>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                      <div>Approved: {row.approvedAmount ?? "N/A"} {row.approvedAmount ? row.currency : ""}</div>
                      <div>Settlement Date: {fmtDate(row.requestedSettlementDate)}</div>
                      <div>Reviewed: {fmtDate(row.reviewedAt)}</div>
                      <div>Settled: {fmtDate(row.settledAt)}</div>
                    </div>
                    {row.requestNote ? <p className="mt-3 text-sm">Request note: {row.requestNote}</p> : null}
                    {row.reviewNote ? <p className="mt-2 text-sm text-muted-foreground">Review note: {row.reviewNote}</p> : null}
                    {row.rejectionReason ? (
                      <p className="mt-2 text-sm text-destructive">Rejection reason: {row.rejectionReason}</p>
                    ) : null}
                    {row.settlementNote ? (
                      <p className="mt-2 text-sm text-muted-foreground">Settlement note: {row.settlementNote}</p>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
