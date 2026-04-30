"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/upload-file";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestorWorkflowGuide } from "@/components/investors/InvestorWorkflowGuide";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InvestorDocument = {
  id: number;
  investorId: number;
  type: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isExpired: boolean;
  uploadedBy?: { id: string; name: string | null; email: string } | null;
  reviewedBy?: { id: string; name: string | null; email: string } | null;
};

type InvestorSummary = {
  id: number;
  code: string;
  name: string;
  email: string | null;
  status: string;
  kycStatus: string;
  kycVerifiedAt: string | null;
  documents: InvestorDocument[];
  missingDocumentTypes: string[];
};

type Payload = {
  requiredDocumentTypes: string[];
  investors: InvestorSummary[];
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

export default function InvestorDocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [requiredTypes, setRequiredTypes] = useState<string[]>([]);
  const [investors, setInvestors] = useState<InvestorSummary[]>([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  const load = async (nextSearch = search) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      const response = await fetch(
        `/api/admin/investor-documents${params.size ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load investor documents.");
      }
      const data = payload as Payload;
      setRequiredTypes(Array.isArray(data.requiredDocumentTypes) ? data.requiredDocumentTypes : []);
      setInvestors(Array.isArray(data.investors) ? data.investors : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load("");
  }, []);

  const summary = useMemo(() => {
    const totalDocs = investors.reduce((sum, investor) => sum + investor.documents.length, 0);
    const pendingDocs = investors.reduce(
      (sum, investor) =>
        sum + investor.documents.filter((document) => document.status === "PENDING" || document.status === "UNDER_REVIEW").length,
      0,
    );
    const expiredDocs = investors.reduce(
      (sum, investor) => sum + investor.documents.filter((document) => document.isExpired).length,
      0,
    );
    const missingSlots = investors.reduce(
      (sum, investor) => sum + investor.missingDocumentTypes.length,
      0,
    );
    return { totalDocs, pendingDocs, expiredDocs, missingSlots };
  }, [investors]);

  const uploadDocument = async () => {
    if (!selectedInvestorId || !selectedType || !file) {
      toast.error("Investor, document type, and file are required.");
      return;
    }

    try {
      setSaving(true);
      const fileUrl = await uploadFile(file, "/api/upload/investor-kyc");
      const response = await fetch("/api/admin/investor-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: Number(selectedInvestorId),
          type: selectedType,
          fileUrl,
          fileName: file.name,
          mimeType: file.type || null,
          fileSize: file.size,
          documentNumber,
          issuedAt: issuedAt || null,
          expiresAt: expiresAt || null,
          reviewNote: note || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to upload investor document.");
      }
      toast.success("Investor document uploaded.");
      setSelectedType("");
      setFile(null);
      setDocumentNumber("");
      setIssuedAt("");
      setExpiresAt("");
      setNote("");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload investor document.");
    } finally {
      setSaving(false);
    }
  };

  const reviewDocument = async (documentId: number, action: "verify" | "reject" | "reopen") => {
    try {
      setSaving(true);
      const response = await fetch("/api/admin/investor-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          action,
          reviewNote: reviewNotes[documentId] || "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to review investor document.");
      }
      toast.success("Document review updated.");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to review investor document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <InvestorWorkflowGuide currentSection="documents" />

      <div>
        <h1 className="text-2xl font-semibold">Investor Documents</h1>
        <p className="text-sm text-muted-foreground">
          Manage the investor KYC document vault, review queue, and expiry visibility.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Investors</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{investors.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Documents</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{summary.totalDocs}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{summary.pendingDocs}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Expired / Missing</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{summary.expiredDocs + summary.missingSlots}</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload / Replace Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1">
              <Label>Investor</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedInvestorId}
                onChange={(event) => setSelectedInvestorId(event.target.value)}
              >
                <option value="">Select investor</option>
                {investors.map((investor) => (
                  <option key={investor.id} value={investor.id}>
                    {investor.name} ({investor.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Document Type</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
              >
                <option value="">Select document type</option>
                {requiredTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>File</Label>
              <Input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </div>
            <div className="space-y-1">
              <Label>Document Number</Label>
              <Input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Issued At</Label>
              <Input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Expires At</Label>
              <Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Upload Note</Label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <Button onClick={() => void uploadDocument()} disabled={saving}>
            {saving ? "Saving..." : "Upload Document"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Registry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search investor..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="max-w-md"
            />
            <Button variant="outline" onClick={() => void load(search)}>Search</Button>
          </div>

          {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}

          <div className="space-y-4">
            {investors.map((investor) => (
              <div key={investor.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{investor.name} ({investor.code})</p>
                    <p className="text-sm text-muted-foreground">
                      KYC: {investor.kycStatus} {investor.kycVerifiedAt ? `• Verified ${fmtDate(investor.kycVerifiedAt)}` : ""}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Missing: {investor.missingDocumentTypes.length > 0 ? investor.missingDocumentTypes.join(", ") : "None"}
                  </div>
                </div>

                {investor.kycStatus === "UNDER_REVIEW" &&
                investor.documents.some((document) => document.status === "UNDER_REVIEW") ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    KYC is under review because approved profile changes reopened supporting documents for verification.
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {investor.documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                  ) : investor.documents.map((document) => (
                    <div key={document.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{document.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {document.fileName || "Uploaded file"} • {document.status}
                          </p>
                        </div>
                        <a href={document.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                          View
                        </a>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                        <div>Uploaded: {fmtDate(document.createdAt)}</div>
                        <div>Expires: {fmtDate(document.expiresAt)}</div>
                        <div>Reviewed: {fmtDate(document.reviewedAt)}</div>
                        {document.reviewNote ? <div>Note: {document.reviewNote}</div> : null}
                      </div>
                      <Textarea
                        className="mt-3"
                        placeholder="Review note"
                        value={reviewNotes[document.id] ?? document.reviewNote ?? ""}
                        onChange={(event) =>
                          setReviewNotes((current) => ({ ...current, [document.id]: event.target.value }))
                        }
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void reviewDocument(document.id, "verify")} disabled={saving}>
                          Verify
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void reviewDocument(document.id, "reopen")} disabled={saving}>
                          Reopen
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void reviewDocument(document.id, "reject")} disabled={saving}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!loading && investors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No investors found.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
