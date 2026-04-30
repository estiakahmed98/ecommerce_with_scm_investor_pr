"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/upload-file";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InvestorDocument = {
  id: number;
  type: string;
  fileUrl: string;
  fileName: string | null;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  isExpired: boolean;
};

type Payload = {
  requiredDocumentTypes: string[];
  investor: {
    id: number;
    code: string;
    name: string;
    status: string;
    kycStatus: string;
    kycVerifiedAt: string | null;
  } | null;
  documents: InvestorDocument[];
  missingDocumentTypes: string[];
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
  const [data, setData] = useState<Payload | null>(null);
  const [selectedType, setSelectedType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/investor/documents", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load investor documents.");
      }
      setData(payload as Payload);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor documents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const currentByType = useMemo(
    () => new Map((data?.documents || []).map((document) => [document.type, document])),
    [data?.documents],
  );
  const docsUnderReview = useMemo(
    () => (data?.documents || []).filter((document) => document.status === "UNDER_REVIEW"),
    [data?.documents],
  );

  const submitDocument = async () => {
    if (!selectedType || !file) {
      toast.error("Document type and file are required.");
      return;
    }

    try {
      setSaving(true);
      const fileUrl = await uploadFile(file, "/api/upload/investor-kyc");
      const response = await fetch("/api/investor/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      toast.success("Document submitted for review.");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Document Center</h1>
        <p className="text-sm text-muted-foreground">
          Upload required KYC documents, track review notes, and re-submit rejected files.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading document center...</p> : null}

      {!loading && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">KYC Status</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.investor?.kycStatus || "N/A"}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Documents Uploaded</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.documents.length}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Missing Required</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.missingDocumentTypes.length}</CardContent></Card>
          </div>

          {data.investor?.kycStatus === "UNDER_REVIEW" && docsUnderReview.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              KYC is under review because approved profile changes require document re-verification.
              Re-check these document(s): {docsUnderReview.map((item) => item.type).join(", ")}.
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload or Re-submit Document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <Label>Document Type</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value)}
                  >
                    <option value="">Select document type</option>
                    {data.requiredDocumentTypes.map((type) => (
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
                <Label>Submission Note</Label>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
              <Button onClick={() => void submitDocument()} disabled={saving}>
                {saving ? "Submitting..." : "Submit Document"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Required Documents</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data.requiredDocumentTypes.map((type) => {
                const document = currentByType.get(type);
                return (
                  <div key={type} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{type}</p>
                        <p className="text-xs text-muted-foreground">
                          {document ? `Status: ${document.status}` : "Not uploaded yet"}
                        </p>
                      </div>
                      {document?.fileUrl ? (
                        <a href={document.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                          View
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      <div>Uploaded: {fmtDate(document?.createdAt)}</div>
                      <div>Reviewed: {fmtDate(document?.reviewedAt)}</div>
                      <div>Expires: {fmtDate(document?.expiresAt)}</div>
                      {document?.reviewNote ? <div>Note: {document.reviewNote}</div> : null}
                    </div>
                    {document ? (
                      <div className="mt-3 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                        Re-upload the same document type if the file was rejected, expired, or needs replacement.
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
