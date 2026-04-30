"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SupplierOption = {
  id: number;
  code: string;
  name: string;
};

type FeedbackRow = {
  id: number;
  sourceType: string;
  sourceReference: string | null;
  clientName: string | null;
  clientEmail: string | null;
  rating: number;
  serviceQualityRating: number | null;
  deliveryRating: number | null;
  complianceRating: number | null;
  comment: string | null;
  createdAt: string;
  supplier: SupplierOption;
  createdBy: { id: string; name: string | null; email: string | null } | null;
};

type FeedbackResponse = {
  suppliers: SupplierOption[];
  rows: FeedbackRow[];
};

function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function VendorFeedbackPage() {
  const [data, setData] = useState<FeedbackResponse>({ suppliers: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [form, setForm] = useState({
    sourceType: "INTERNAL",
    sourceReference: "",
    clientName: "",
    clientEmail: "",
    rating: "5",
    serviceQualityRating: "5",
    deliveryRating: "5",
    complianceRating: "5",
    comment: "",
  });

  const load = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (supplierId) params.set("supplierId", supplierId);
      const response = await fetch(
        `/api/scm/supplier-feedback${params.size > 0 ? `?${params.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load supplier feedback.");
      }
      setData(payload as FeedbackResponse);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load supplier feedback.");
      setData({ suppliers: [], rows: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, supplierId]);

  const createFeedback = async () => {
    if (!supplierId) {
      toast.error("Select a supplier first.");
      return;
    }
    try {
      setSaving(true);
      const response = await fetch("/api/scm/supplier-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(supplierId),
          sourceType: form.sourceType,
          sourceReference: form.sourceReference,
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          rating: Number(form.rating),
          serviceQualityRating: Number(form.serviceQualityRating),
          deliveryRating: Number(form.deliveryRating),
          complianceRating: Number(form.complianceRating),
          comment: form.comment,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create feedback.");
      }
      toast.success("Supplier feedback created.");
      setForm((current) => ({ ...current, sourceReference: "", comment: "" }));
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create feedback.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Vendor Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Capture service quality and vendor performance feedback from operations/clients.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Supplier</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Select supplier</option>
                {data.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({supplier.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Source Type</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.sourceType}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sourceType: event.target.value }))
                }
              >
                <option value="INTERNAL">INTERNAL</option>
                <option value="CLIENT">CLIENT</option>
                <option value="VENDOR_SELF">VENDOR_SELF</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Source Reference</Label>
              <Input
                placeholder="WO/PO/Ticket ref"
                value={form.sourceReference}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sourceReference: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label>Overall</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.rating}
                onChange={(event) =>
                  setForm((current) => ({ ...current, rating: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Service</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.serviceQualityRating}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    serviceQualityRating: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Delivery</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.deliveryRating}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deliveryRating: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Compliance</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.complianceRating}
                onChange={(event) =>
                  setForm((current) => ({ ...current, complianceRating: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Client Name</Label>
              <Input
                value={form.clientName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, clientName: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Client Email</Label>
              <Input
                value={form.clientEmail}
                onChange={(event) =>
                  setForm((current) => ({ ...current, clientEmail: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Comment</Label>
              <Textarea
                value={form.comment}
                onChange={(event) =>
                  setForm((current) => ({ ...current, comment: event.target.value }))
                }
              />
            </div>
          </div>

          <Button onClick={() => void createFeedback()} disabled={saving}>
            {saving ? "Saving..." : "Create Feedback"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback Register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md"
              placeholder="Search supplier / client / reference"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback records found.</p>
          ) : (
            <div className="space-y-3">
              {data.rows.map((row) => (
                <div key={row.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {row.supplier.name} ({row.supplier.code}) | Rating {row.rating}/5
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDate(row.createdAt)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Source: {row.sourceType}
                    {row.sourceReference ? ` (${row.sourceReference})` : ""}
                    {row.clientName ? ` | Client: ${row.clientName}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Service: {row.serviceQualityRating ?? "N/A"} | Delivery:{" "}
                    {row.deliveryRating ?? "N/A"} | Compliance: {row.complianceRating ?? "N/A"}
                  </p>
                  {row.comment ? <p className="mt-1">{row.comment}</p> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
