"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SUPPLIER_DOCUMENT_SECTIONS,
  getRequiredSupplierDocumentTypes,
  getSupplierDocumentLabel,
  type SupplierCompanyType,
  type SupplierDocumentType,
} from "@/lib/supplier-documents";
import { uploadFile } from "@/lib/upload-file";

type SupplierProfileResponse = {
  supplier: {
    id: number;
    code: string;
    name: string;
    companyType: SupplierCompanyType;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    leadTimeDays: number | null;
    paymentTermsDays: number | null;
    currency: string;
    taxNumber: string | null;
    notes: string | null;
    isActive: boolean;
    categories: Array<{ id: number; code: string; name: string }>;
    documents: Array<{
      id: number;
      type: SupplierDocumentType;
      documentNumber: string | null;
      fileUrl: string;
      fileName: string | null;
      mimeType: string | null;
      fileSize: number | null;
      issuedAt: string | null;
      expiresAt: string | null;
      verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
      verifiedAt: string | null;
      verificationNote: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  portalAccess: {
    id: string;
    status: string;
    note: string | null;
    twoFactorRequired: boolean;
    twoFactorMethod: string | null;
    twoFactorLastVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  unreadNotificationCount: number;
  recentRequests: Array<{
    id: number;
    requestType: "PROFILE_UPDATE" | "DOCUMENT_UPDATE" | "ANNUAL_RENEWAL";
    status: "PENDING" | "APPROVED" | "REJECTED";
    note: string | null;
    reviewNote: string | null;
    requestedAt: string;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
    reviewedBy: { id: string; name: string | null; email: string | null } | null;
  }>;
};

type DocumentDraft = {
  type: SupplierDocumentType;
  documentNumber: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  issuedAt: string;
  expiresAt: string;
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
  verificationNote: string | null;
  file: File | null;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function SupplierProfilePage() {
  const [data, setData] = useState<SupplierProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [requestType, setRequestType] = useState<
    "PROFILE_UPDATE" | "DOCUMENT_UPDATE" | "ANNUAL_RENEWAL"
  >("PROFILE_UPDATE");

  const [profile, setProfile] = useState({
    contactName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "BD",
    taxNumber: "",
    notes: "",
    leadTimeDays: "",
    paymentTermsDays: "",
    currency: "BDT",
  });
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/supplier/profile", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load profile.");
      }
      const parsed = payload as SupplierProfileResponse;
      setData(parsed);
      setProfile({
        contactName: parsed.supplier.contactName ?? "",
        email: parsed.supplier.email ?? "",
        phone: parsed.supplier.phone ?? "",
        address: parsed.supplier.address ?? "",
        city: parsed.supplier.city ?? "",
        country: parsed.supplier.country ?? "BD",
        taxNumber: parsed.supplier.taxNumber ?? "",
        notes: parsed.supplier.notes ?? "",
        leadTimeDays: parsed.supplier.leadTimeDays?.toString() ?? "",
        paymentTermsDays: parsed.supplier.paymentTermsDays?.toString() ?? "",
        currency: parsed.supplier.currency ?? "BDT",
      });

      const byType = new Map(parsed.supplier.documents.map((doc) => [doc.type, doc]));
      const requiredTypes = getRequiredSupplierDocumentTypes(parsed.supplier.companyType);
      setDocuments(
        requiredTypes.map((type) => {
          const existing = byType.get(type);
          return {
            type,
            documentNumber: existing?.documentNumber ?? "",
            fileUrl: existing?.fileUrl ?? "",
            fileName: existing?.fileName ?? null,
            mimeType: existing?.mimeType ?? null,
            fileSize: existing?.fileSize ?? null,
            issuedAt: existing?.issuedAt ? existing.issuedAt.slice(0, 10) : "",
            expiresAt: existing?.expiresAt ? existing.expiresAt.slice(0, 10) : "",
            verificationStatus: existing?.verificationStatus ?? "PENDING",
            verificationNote: existing?.verificationNote ?? null,
            file: null,
          };
        }),
      );
    } catch (err: any) {
      setError(err?.message || "Failed to load profile.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const documentSections = useMemo(
    () => (data ? SUPPLIER_DOCUMENT_SECTIONS[data.supplier.companyType] : []),
    [data],
  );

  const updateDocument = (type: SupplierDocumentType, patch: Partial<DocumentDraft>) => {
    setDocuments((current) =>
      current.map((item) => (item.type === type ? { ...item, ...patch } : item)),
    );
  };

  const handleFileChange = (type: SupplierDocumentType, file: File | null) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Each file must be 10 MB or smaller.");
      return;
    }
    updateDocument(type, {
      file,
      fileName: file.name,
      mimeType: file.type || null,
      fileSize: file.size,
    });
  };

  const submitRequest = async () => {
    if (!data) return;
    try {
      setSaving(true);

      const payloadDocuments = [];
      for (const item of documents) {
        let fileUrl = item.fileUrl;
        if (item.file) {
          fileUrl = await uploadFile(item.file);
        }
        if (!fileUrl) continue;
        payloadDocuments.push({
          type: item.type,
          documentNumber: item.documentNumber || null,
          fileUrl,
          fileName: item.file ? item.file.name : item.fileName,
          mimeType: item.file ? item.file.type || null : item.mimeType,
          fileSize: item.file ? item.file.size : item.fileSize,
          issuedAt: item.issuedAt || null,
          expiresAt: item.expiresAt || null,
        });
      }

      const response = await fetch("/api/supplier/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          note,
          ...profile,
          documents: payloadDocuments,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit update request.");
      }

      toast.success("Update request submitted for admin review.");
      setNote("");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit update request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Supplier Profile & Compliance</h1>
        <p className="text-sm text-muted-foreground">
          Update profile/documents through approval workflow. Changes are applied after admin review.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading profile...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {data.supplier.name} ({data.supplier.code})
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Portal Status</p>
                <p className="font-medium">{data.portalAccess.status}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Unread Alerts</p>
                <p className="font-medium">{data.unreadNotificationCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">2FA Policy</p>
                <p className="font-medium">
                  {data.portalAccess.twoFactorRequired
                    ? `Required (${data.portalAccess.twoFactorMethod || "PREFERRED"})`
                    : "Preferred (not enforced yet)"}
                </p>
              </div>
              <div className="md:col-span-3">
                <p className="text-muted-foreground">Assigned Categories</p>
                <p className="font-medium">
                  {data.supplier.categories.length > 0
                    ? data.supplier.categories.map((item) => item.name).join(", ")
                    : "Uncategorized"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Update Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Contact Name</Label>
                  <Input
                    value={profile.contactName}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, contactName: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    value={profile.email}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, email: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input
                    value={profile.phone}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, phone: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input
                    value={profile.city}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, city: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Country</Label>
                  <Input
                    value={profile.country}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, country: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tax Number</Label>
                  <Input
                    value={profile.taxNumber}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, taxNumber: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Lead Time (Days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={profile.leadTimeDays}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, leadTimeDays: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Payment Terms (Days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={profile.paymentTermsDays}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        paymentTermsDays: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Input
                    value={profile.currency}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Address</Label>
                  <Textarea
                    value={profile.address}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, address: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Internal Note (Supplier side context)</Label>
                  <Textarea
                    value={profile.notes}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, notes: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Request Type</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={requestType}
                      onChange={(event) =>
                        setRequestType(
                          event.target.value as
                            | "PROFILE_UPDATE"
                            | "DOCUMENT_UPDATE"
                            | "ANNUAL_RENEWAL",
                        )
                      }
                    >
                      <option value="PROFILE_UPDATE">Profile Update</option>
                      <option value="DOCUMENT_UPDATE">Document Update</option>
                      <option value="ANNUAL_RENEWAL">Annual Renewal</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Request Note</Label>
                    <Input
                      placeholder="Why this update is needed..."
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-5 rounded-md border p-4">
                <p className="text-sm font-medium">Compliance Documents</p>
                {documentSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <div>
                      <p className="font-medium">{section.title}</p>
                      <p className="text-xs text-muted-foreground">{section.description}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {section.types.map((type) => {
                        const draft = documents.find((item) => item.type === type);
                        if (!draft) return null;
                        return (
                          <div key={type} className="space-y-2 rounded-md border p-3">
                            <p className="text-sm font-medium">{getSupplierDocumentLabel(type)}</p>
                            <p className="text-xs text-muted-foreground">
                              Status: {draft.verificationStatus}
                              {draft.verificationNote ? ` | ${draft.verificationNote}` : ""}
                            </p>
                            <Input
                              placeholder="Document number"
                              value={draft.documentNumber}
                              onChange={(event) =>
                                updateDocument(type, { documentNumber: event.target.value })
                              }
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input
                                type="date"
                                value={draft.issuedAt}
                                onChange={(event) =>
                                  updateDocument(type, { issuedAt: event.target.value })
                                }
                              />
                              <Input
                                type="date"
                                value={draft.expiresAt}
                                onChange={(event) =>
                                  updateDocument(type, { expiresAt: event.target.value })
                                }
                              />
                            </div>
                            <Input
                              type="file"
                              accept={FILE_ACCEPT}
                              onChange={(event) =>
                                handleFileChange(type, event.target.files?.[0] ?? null)
                              }
                            />
                            {draft.file ? (
                              <p className="text-xs text-amber-600">
                                New file selected: {draft.file.name}
                              </p>
                            ) : draft.fileUrl ? (
                              <a
                                href={draft.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline"
                              >
                                View current file
                              </a>
                            ) : (
                              <p className="text-xs text-destructive">No file uploaded yet.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={() => void submitRequest()} disabled={saving}>
                {saving ? "Submitting..." : "Submit For Approval"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.recentRequests.map((item) => (
                    <div key={item.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          #{item.id} | {item.requestType}
                        </p>
                        <p>{item.status}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Requested: {fmtDate(item.requestedAt)} | Reviewed:{" "}
                        {fmtDate(item.reviewedAt)}
                      </p>
                      {item.note ? <p className="mt-1 text-xs">Request note: {item.note}</p> : null}
                      {item.reviewNote ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Review note: {item.reviewNote}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
