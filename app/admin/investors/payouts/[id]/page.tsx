"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/upload-file";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Payload = {
  payout: {
    id: number;
    payoutNumber: string;
    payoutAmount: string;
    grossProfitAmount: string;
    holdbackAmount: string;
    holdbackPercent: string;
    payoutPercent: string;
    status: string;
    currency: string;
    paymentMethod: string | null;
    bankReference: string | null;
    note: string | null;
    approvalNote: string | null;
    rejectionReason: string | null;
    beneficiaryNameSnapshot: string | null;
    beneficiaryBankNameSnapshot: string | null;
    beneficiaryAccountNumberSnapshot: string | null;
    beneficiaryVerifiedAt: string | null;
    beneficiaryVerificationNote: string | null;
    holdReason: string | null;
    heldAt: string | null;
    releasedAt: string | null;
    releaseNote: string | null;
    paymentProofUrl: string | null;
    paymentProofUploadedAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    paidAt: string | null;
    voidedAt: string | null;
    voidReason: string | null;
    voidReversalReference: string | null;
    investor: {
      id: number;
      code: string;
      name: string;
      status: string;
      bankName: string | null;
      bankAccountName: string | null;
      bankAccountNumber: string | null;
      beneficiaryVerifiedAt: string | null;
      beneficiaryVerificationNote: string | null;
    };
    run: {
      id: number;
      runNumber: string;
      status: string;
      fromDate: string;
      toDate: string;
    };
    transaction: {
      id: number;
      transactionNumber: string;
      transactionDate: string;
      amount: string;
    } | null;
  };
  readiness: {
    beneficiaryVerified: boolean;
    onHold: boolean;
    canPay: boolean;
  };
  recentActivity: Array<{
    id: string;
    action: string;
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

function maskAccount(value?: string | null) {
  if (!value) return "N/A";
  if (value.length <= 4) return value;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export default function InvestorPayoutDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canApprove = permissions.includes("investor_payout.approve");
  const canPay = permissions.includes("investor_payout.pay");
  const canVoid = permissions.includes("investor_payout.void");
  const canManage = permissions.includes("investor_payout.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [note, setNote] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [paidAt, setPaidAt] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadedProofUrl, setUploadedProofUrl] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/investor-payouts/${params.id}`, {
        cache: "no-store",
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to load investor payout.");
      }
      const data = next as Payload;
      setPayload(data);
      setBankReference(data.payout.bankReference || "");
      setPaymentMethod(data.payout.paymentMethod || "BANK_TRANSFER");
      setPaidAt(data.payout.paidAt ? data.payout.paidAt.slice(0, 16) : "");
      setUploadedProofUrl(data.payout.paymentProofUrl || "");
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor payout.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) void load();
  }, [params.id]);

  const act = async (action: "approve" | "reject" | "hold" | "release" | "pay" | "void") => {
    try {
      setSaving(true);
      let paymentProofUrl = uploadedProofUrl;
      if (action === "pay" && file) {
        paymentProofUrl = await uploadFile(file, "/api/upload/investor-payout-proof");
        setUploadedProofUrl(paymentProofUrl);
      }

      const response = await fetch(`/api/admin/investor-payouts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note,
          holdReason: note,
          releaseNote: note,
          paymentMethod,
          bankReference,
          paidAt: paidAt || null,
          paymentProofUrl: paymentProofUrl || null,
          voidReason,
        }),
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to process payout.");
      }
      toast.success(`Payout action completed: ${action}.`);
      setNote("");
      setFile(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to process payout.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !payload) {
    return <div className="p-6 text-sm text-muted-foreground">Loading payout detail...</div>;
  }

  const { payout, readiness, recentActivity } = payload;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{payout.payoutNumber}</h1>
        <p className="text-sm text-muted-foreground">
          Beneficiary-safe payout workspace with hold/release control, payment proof, and execution traceability.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Payout Amount</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(payout.payoutAmount)} {payout.currency}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Gross Profit</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(payout.grossProfitAmount)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Holdback</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(payout.holdbackAmount)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{payout.status}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">On Hold</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{readiness.onHold ? "Yes" : "No"}</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payout Context</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Investor</div><Link href={`/admin/investors/${payout.investor.id}`} className="mt-1 block font-medium hover:text-primary">{payout.investor.name} ({payout.investor.code})</Link></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Run</div><Link href={`/admin/investors/profit-runs/${payout.run.id}`} className="mt-1 block font-medium hover:text-primary">{payout.run.runNumber}</Link></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Approved</div><div className="mt-1 font-medium">{fmtDate(payout.approvedAt)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Paid</div><div className="mt-1 font-medium">{fmtDate(payout.paidAt)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Hold Reason</div><div className="mt-1 font-medium">{payout.holdReason || "N/A"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Release Note</div><div className="mt-1 font-medium">{payout.releaseNote || "N/A"}</div></div>
            <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">Execution Note</div><div className="mt-1 whitespace-pre-wrap font-medium">{payout.note || "N/A"}</div></div>
            {payout.transaction ? (
              <div className="md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Ledger Transaction</div>
                <Link href={`/admin/investors/ledger/${payout.transaction.id}`} className="mt-1 block font-medium hover:text-primary">
                  {payout.transaction.transactionNumber}
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Beneficiary Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Investor Beneficiary Verified</div><div className="mt-1 font-medium">{fmtDate(payout.investor.beneficiaryVerifiedAt)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Snapshot Verified</div><div className="mt-1 font-medium">{fmtDate(payout.beneficiaryVerifiedAt)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Beneficiary Name</div><div className="mt-1 font-medium">{payout.beneficiaryNameSnapshot || "N/A"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Bank</div><div className="mt-1 font-medium">{payout.beneficiaryBankNameSnapshot || "N/A"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Account</div><div className="mt-1 font-medium">{maskAccount(payout.beneficiaryAccountNumberSnapshot)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Verification Note</div><div className="mt-1 font-medium">{payout.beneficiaryVerificationNote || "N/A"}</div></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!readiness.beneficiaryVerified ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Payout beneficiary is not fully verified. Approval/payment should not proceed until investor beneficiary verification is completed.
            </div>
          ) : null}
          {readiness.onHold ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              Payout is currently on hold. Release it before payment.
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Workflow Note</Label>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
            </div>
            <div className="space-y-1">
              <Label>Void Reason</Label>
              <Textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={3} />
            </div>
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                <option value="MOBILE_BANKING">MOBILE_BANKING</option>
                <option value="CHEQUE">CHEQUE</option>
                <option value="CASH">CASH</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Bank Reference</Label>
              <Input value={bankReference} onChange={(event) => setBankReference(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Paid At</Label>
              <Input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment Proof</Label>
              <Input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              {uploadedProofUrl ? (
                <a href={uploadedProofUrl} className="text-xs text-primary underline" target="_blank" rel="noreferrer">
                  View current proof
                </a>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canApprove && payout.status === "PENDING_APPROVAL" ? (
              <>
                <Button onClick={() => void act("approve")} disabled={saving || !readiness.beneficiaryVerified}>
                  {saving ? "Working..." : "Approve"}
                </Button>
                <Button variant="outline" onClick={() => void act("reject")} disabled={saving}>
                  {saving ? "Working..." : "Reject"}
                </Button>
              </>
            ) : null}
            {(canManage || canApprove || canPay) && ["PENDING_APPROVAL", "APPROVED"].includes(payout.status) && !readiness.onHold ? (
              <Button variant="outline" onClick={() => void act("hold")} disabled={saving}>
                {saving ? "Working..." : "Hold"}
              </Button>
            ) : null}
            {(canManage || canApprove || canPay) && readiness.onHold ? (
              <Button variant="outline" onClick={() => void act("release")} disabled={saving}>
                {saving ? "Working..." : "Release Hold"}
              </Button>
            ) : null}
            {canPay && payout.status === "APPROVED" ? (
              <Button onClick={() => void act("pay")} disabled={saving || !readiness.canPay}>
                {saving ? "Working..." : "Mark Paid"}
              </Button>
            ) : null}
            {canVoid && (payout.status === "APPROVED" || payout.status === "PAID") ? (
              <Button variant="destructive" onClick={() => void act("void")} disabled={saving}>
                {saving ? "Working..." : "Void"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="space-y-3">
          {recentActivity.length > 0 ? (
            recentActivity.map((item) => (
              <div key={item.id} className="rounded-lg border p-4 text-sm">
                <div className="font-medium">{item.metadata?.message || item.action}</div>
                <div className="mt-1 text-muted-foreground">
                  {item.actorName || item.actorEmail || "System"} | {fmtDate(item.createdAt)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No payout activity logged yet.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
