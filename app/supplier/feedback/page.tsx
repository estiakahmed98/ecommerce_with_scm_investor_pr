"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SupplierFeedbackResponse = {
  summary: {
    count: number;
    avgRating: number | null;
  };
  rows: Array<{
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
  }>;
};

function fmtDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

export default function SupplierFeedbackPage() {
  const [data, setData] = useState<SupplierFeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/supplier/feedback", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load feedback.");
      }
      setData(payload as SupplierFeedbackResponse);
    } catch (err: any) {
      setError(err?.message || "Failed to load feedback.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Client Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Track performance ratings and service-quality comments.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading feedback...</p> : null}
      {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Feedback Count</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{data.summary.count}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Average Rating</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.summary.avgRating === null ? "N/A" : data.summary.avgRating.toFixed(2)}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Feedback History</CardTitle>
            </CardHeader>
            <CardContent>
              {data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No feedback posted yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.rows.map((row) => (
                    <div key={row.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          Rating: {row.rating}/5 ({row.sourceType})
                        </p>
                        <p className="text-xs text-muted-foreground">{fmtDate(row.createdAt)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Service: {row.serviceQualityRating ?? "N/A"} | Delivery:{" "}
                        {row.deliveryRating ?? "N/A"} | Compliance: {row.complianceRating ?? "N/A"}
                      </p>
                      {row.clientName || row.sourceReference ? (
                        <p className="text-xs text-muted-foreground">
                          Source: {row.clientName || "N/A"}
                          {row.sourceReference ? ` (${row.sourceReference})` : ""}
                        </p>
                      ) : null}
                      {row.comment ? <p className="mt-2">{row.comment}</p> : null}
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
