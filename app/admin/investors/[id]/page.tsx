"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Person = { id: string; name: string | null; email: string };

type InvestorDetail = {
  id: number;
  code: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  taxNumber: string | null;
  nationalIdNumber: string | null;
  passportNumber: string | null;
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    beneficiaryVerifiedAt: string | null;
    beneficiaryVerificationNote: string | null;
    status: string;
  kycStatus: string;
  kycVerifiedAt: string | null;
  kycReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: Person | null;
  portalAccesses: Array<{
    id: number;
    status: string;
    createdAt: string;
    user: Person;
  }>;
  documents: Array<{
    id: number;
    type: string;
    status: string;
    isExpired: boolean;
  }>;
  _count: {
    transactions: number;
    allocations: number;
    payouts: number;
    documents: number;
    changeRequests: number;
  };
  totals: {
    credit: string;
    debit: string;
    balance: string;
  };
};

type ChangeRequest = {
  id: number;
  status: string;
  requestedChanges: Record<string, unknown>;
  currentSnapshot: Record<string, unknown> | null;
  changeSummary: string | null;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
  requestedBy: Person | null;
  reviewedBy: Person | null;
};

type ActivityItem = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  metadata?: { message?: string } | null;
};

type DetailPayload = {
  investor: InvestorDetail;
  changeRequests: ChangeRequest[];
  recentActivity: ActivityItem[];
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

export default function InvestorDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canManage = globalPermissions.includes("investors.manage");

  const [loading, setLoading] = useState(true);
  const [savingDirect, setSavingDirect] = useState(false);
  const [savingRequest, setSavingRequest] = useState(false);
  const [savingBeneficiary, setSavingBeneficiary] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [payload, setPayload] = useState<DetailPayload | null>(null);
  const [directForm, setDirectForm] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [requestForm, setRequestForm] = useState({
    legalName: "",
    taxNumber: "",
    nationalIdNumber: "",
    passportNumber: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
    status: "ACTIVE",
    kycReference: "",
    changeSummary: "",
  });
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/investors/${params.id}`, { cache: "no-store" });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to load investor detail.");
      }
      const data = next as DetailPayload;
      setPayload(data);
      setDirectForm({
        name: data.investor.name ?? "",
        email: data.investor.email ?? "",
        phone: data.investor.phone ?? "",
        notes: data.investor.notes ?? "",
      });
      setRequestForm({
        legalName: data.investor.legalName ?? "",
        taxNumber: data.investor.taxNumber ?? "",
        nationalIdNumber: data.investor.nationalIdNumber ?? "",
        passportNumber: data.investor.passportNumber ?? "",
        bankName: data.investor.bankName ?? "",
        bankAccountName: data.investor.bankAccountName ?? "",
        bankAccountNumber: data.investor.bankAccountNumber ?? "",
        status: data.investor.status ?? "ACTIVE",
        kycReference: data.investor.kycReference ?? "",
        changeSummary: "",
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor detail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      void load();
    }
  }, [params.id]);

  const documentSummary = useMemo(() => {
    const docs = payload?.investor.documents ?? [];
    return {
      verified: docs.filter((item) => item.status === "VERIFIED").length,
      pending: docs.filter((item) => item.status === "PENDING" || item.status === "UNDER_REVIEW")
        .length,
      expired: docs.filter((item) => item.isExpired).length,
    };
  }, [payload]);

  const saveDirect = async () => {
    try {
      setSavingDirect(true);
      const response = await fetch(`/api/admin/investors/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(directForm),
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to update investor.");
      }
      toast.success("Investor profile updated.");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update investor.");
    } finally {
      setSavingDirect(false);
    }
  };

  const submitChangeRequest = async () => {
    try {
      setSavingRequest(true);
      const response = await fetch(`/api/admin/investors/${params.id}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestForm),
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to submit change request.");
      }
      toast.success("Sensitive change request submitted for approval.");
      setRequestForm((current) => ({ ...current, changeSummary: "" }));
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit change request.");
    } finally {
      setSavingRequest(false);
    }
  };

  const reviewChangeRequest = async (changeRequestId: number, action: "approve" | "reject") => {
    try {
      setReviewingId(changeRequestId);
      const response = await fetch(`/api/admin/investor-change-requests/${changeRequestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reviewNote: reviewNotes[changeRequestId] || "",
        }),
      });
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to review change request.");
      }
      toast.success(
        action === "approve" ? "Change request approved." : "Change request rejected.",
      );
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to review change request.");
    } finally {
      setReviewingId(null);
    }
  };

  const updateBeneficiaryVerification = async (action: "verify" | "revoke") => {
    try {
      setSavingBeneficiary(true);
      const response = await fetch(
        `/api/admin/investors/${params.id}/beneficiary-verification`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            note:
              action === "verify"
                ? "Verified for payout execution."
                : "Verification revoked pending beneficiary review.",
          }),
        },
      );
      const next = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(next?.error || "Failed to update beneficiary verification.");
      }
      toast.success(
        action === "verify"
          ? "Investor beneficiary verified."
          : "Investor beneficiary verification revoked.",
      );
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update beneficiary verification.");
    } finally {
      setSavingBeneficiary(false);
    }
  };

  if (loading || !payload) {
    return <div className="p-6 text-sm text-muted-foreground">Loading investor detail...</div>;
  }

  const { investor, changeRequests, recentActivity } = payload;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {investor.name} <span className="text-muted-foreground">({investor.code})</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Investor master governance, compliance context, and controlled profile change flow.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Status: <span className="font-medium text-foreground">{investor.status}</span> | KYC:{" "}
          <span className="font-medium text-foreground">{investor.kycStatus}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Net Balance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{fmtMoney(investor.totals.balance)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Allocations</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{investor._count.allocations}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Payouts</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{investor._count.payouts}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Documents</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{investor._count.documents}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Changes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{changeRequests.filter((item) => item.status === "PENDING").length}</CardContent></Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="direct">Direct Updates</TabsTrigger>
          <TabsTrigger value="requests">Sensitive Changes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Investor Master</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Legal Name</div><div className="mt-1 font-medium">{investor.legalName || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div><div className="mt-1 font-medium">{investor.email || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Phone</div><div className="mt-1 font-medium">{investor.phone || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">KYC Reference</div><div className="mt-1 font-medium">{investor.kycReference || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Tax Number</div><div className="mt-1 font-medium">{investor.taxNumber || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">National ID</div><div className="mt-1 font-medium">{investor.nationalIdNumber || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Passport</div><div className="mt-1 font-medium">{investor.passportNumber || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Created By</div><div className="mt-1 font-medium">{investor.createdBy?.name || investor.createdBy?.email || "N/A"}</div></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Bank & Compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Bank Name</div><div className="mt-1 font-medium">{investor.bankName || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Account Name</div><div className="mt-1 font-medium">{investor.bankAccountName || "N/A"}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Account Number</div><div className="mt-1 font-medium">{maskAccount(investor.bankAccountNumber)}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">KYC Verified At</div><div className="mt-1 font-medium">{fmtDate(investor.kycVerifiedAt)}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Beneficiary Verified</div><div className="mt-1 font-medium">{fmtDate(investor.beneficiaryVerifiedAt)}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Beneficiary Note</div><div className="mt-1 font-medium">{investor.beneficiaryVerificationNote || "N/A"}</div></div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => updateBeneficiaryVerification("verify")} disabled={!canManage || savingBeneficiary}>
                    {savingBeneficiary ? "Working..." : "Verify Beneficiary"}
                  </Button>
                  {investor.beneficiaryVerifiedAt ? (
                    <Button size="sm" variant="outline" onClick={() => updateBeneficiaryVerification("revoke")} disabled={!canManage || savingBeneficiary}>
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portal & Document Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Verified Docs</div><div className="mt-1 text-2xl font-semibold">{documentSummary.verified}</div></div>
                  <div className="rounded-lg border p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Pending Docs</div><div className="mt-1 text-2xl font-semibold">{documentSummary.pending}</div></div>
                  <div className="rounded-lg border p-3"><div className="text-xs uppercase tracking-wide text-muted-foreground">Expired Docs</div><div className="mt-1 text-2xl font-semibold">{documentSummary.expired}</div></div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Portal Access</div>
                  {investor.portalAccesses.length > 0 ? (
                    investor.portalAccesses.map((item) => (
                      <div key={item.id} className="rounded-lg border p-3 text-sm">
                        <div className="font-medium">{item.user.name || item.user.email}</div>
                        <div className="text-muted-foreground">
                          {item.status} | Created {fmtDate(item.createdAt)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      No investor portal access assigned.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Governance Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Created At</div><div className="mt-1 font-medium">{fmtDate(investor.createdAt)}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Last Updated</div><div className="mt-1 font-medium">{fmtDate(investor.updatedAt)}</div></div>
                <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div><div className="mt-1 whitespace-pre-wrap font-medium">{investor.notes || "N/A"}</div></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="direct" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Direct Profile Updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Only non-sensitive fields are editable directly. Legal identity, bank, status, and KYC reference must go through a change request.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={directForm.name} onChange={(event) => setDirectForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={directForm.email} onChange={(event) => setDirectForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={directForm.phone} onChange={(event) => setDirectForm((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={directForm.notes} onChange={(event) => setDirectForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
                </div>
              </div>
              <Button onClick={saveDirect} disabled={!canManage || savingDirect}>
                {savingDirect ? "Saving..." : "Save Direct Updates"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit Sensitive Change Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1"><Label>Legal Name</Label><Input value={requestForm.legalName} onChange={(event) => setRequestForm((current) => ({ ...current, legalName: event.target.value }))} /></div>
                <div className="space-y-1"><Label>Status</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={requestForm.status} onChange={(event) => setRequestForm((current) => ({ ...current, status: event.target.value }))}><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="INACTIVE">INACTIVE</option></select></div>
                <div className="space-y-1"><Label>KYC Reference</Label><Input value={requestForm.kycReference} onChange={(event) => setRequestForm((current) => ({ ...current, kycReference: event.target.value }))} /></div>
                <div className="space-y-1"><Label>Tax Number</Label><Input value={requestForm.taxNumber} onChange={(event) => setRequestForm((current) => ({ ...current, taxNumber: event.target.value }))} /></div>
                <div className="space-y-1"><Label>National ID</Label><Input value={requestForm.nationalIdNumber} onChange={(event) => setRequestForm((current) => ({ ...current, nationalIdNumber: event.target.value }))} /></div>
                <div className="space-y-1"><Label>Passport Number</Label><Input value={requestForm.passportNumber} onChange={(event) => setRequestForm((current) => ({ ...current, passportNumber: event.target.value }))} /></div>
                <div className="space-y-1"><Label>Bank Name</Label><Input value={requestForm.bankName} onChange={(event) => setRequestForm((current) => ({ ...current, bankName: event.target.value }))} /></div>
                <div className="space-y-1"><Label>Account Name</Label><Input value={requestForm.bankAccountName} onChange={(event) => setRequestForm((current) => ({ ...current, bankAccountName: event.target.value }))} /></div>
                <div className="space-y-1"><Label>Account Number</Label><Input value={requestForm.bankAccountNumber} onChange={(event) => setRequestForm((current) => ({ ...current, bankAccountNumber: event.target.value }))} /></div>
              </div>
              <div className="space-y-1">
                <Label>Change Summary</Label>
                <Textarea value={requestForm.changeSummary} onChange={(event) => setRequestForm((current) => ({ ...current, changeSummary: event.target.value }))} rows={3} placeholder="Why this sensitive update is required." />
              </div>
              <Button onClick={submitChangeRequest} disabled={!canManage || savingRequest}>
                {savingRequest ? "Submitting..." : "Submit Change Request"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change Request Queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {changeRequests.length > 0 ? (
                changeRequests.map((item) => (
                  <div key={item.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium">Request #{item.id}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.status} | Requested {fmtDate(item.requestedAt)} by {item.requestedBy?.name || item.requestedBy?.email || "Unknown"}
                        </div>
                      </div>
                      {item.status === "PENDING" && canManage ? (
                        <div className="flex gap-2">
                          <Button variant="outline" disabled={reviewingId === item.id} onClick={() => reviewChangeRequest(item.id, "reject")}>
                            Reject
                          </Button>
                          <Button disabled={reviewingId === item.id} onClick={() => reviewChangeRequest(item.id, "approve")}>
                            {reviewingId === item.id ? "Working..." : "Approve"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {item.changeSummary ? (
                      <div className="text-sm">
                        <span className="font-medium">Summary:</span> {item.changeSummary}
                      </div>
                    ) : null}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-lg border p-3">
                        <div className="mb-2 text-sm font-medium">Current Snapshot</div>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(item.currentSnapshot ?? {}, null, 2)}</pre>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="mb-2 text-sm font-medium">Requested Changes</div>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(item.requestedChanges ?? {}, null, 2)}</pre>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Review Note</Label>
                      <Textarea value={reviewNotes[item.id] ?? item.reviewNote ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))} rows={2} />
                    </div>
                    {item.reviewedAt ? (
                      <div className="text-sm text-muted-foreground">
                        Reviewed {fmtDate(item.reviewedAt)} by {item.reviewedBy?.name || item.reviewedBy?.email || "Unknown"}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No investor master change requests yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div className="font-medium">
                        {item.metadata?.message || `${item.action} ${item.entity}`}
                      </div>
                      <div className="text-sm text-muted-foreground">{fmtDate(item.createdAt)}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.actorName || item.actorEmail || "System"} | {item.action} | {item.entity}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No investor activity yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
