"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ScmExceptionList,
  type ScmExceptionItem,
} from "@/components/admin/scm/ScmExceptionList";
import { ScmEmptyState } from "@/components/admin/scm/ScmEmptyState";
import { ScmSectionHeader } from "@/components/admin/scm/ScmSectionHeader";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";

type ExceptionsResponse = {
  summary: {
    critical: number;
    needsReview: number;
    operationalRisks: number;
  };
  critical: ScmExceptionItem[];
  needsReview: ScmExceptionItem[];
  operationalRisks: ScmExceptionItem[];
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || fallback);
  }
  return payload as T;
}

export default function ScmExceptionsPage() {
  const [data, setData] = useState<ExceptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await readJson<ExceptionsResponse>(
        await fetch("/api/scm/exceptions", { cache: "no-store" }),
        "Failed to load SCM exceptions.",
      );
      setData(payload);
    } catch (err: any) {
      setError(err?.message || "Failed to load SCM exceptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-8 p-4 md:p-6">
      <ScmSectionHeader
        title="Exceptions"
        description="Review the items most likely to block procurement flow, stock continuity, invoice control, or supplier governance."
        action={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {loading ? <p className="text-sm text-muted-foreground">Loading SCM exceptions...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <ScmStatCard
          label="Critical"
          value={data?.summary.critical ?? 0}
          hint="Immediate operational or finance risk."
          icon={ShieldAlert}
          tone={(data?.summary.critical ?? 0) > 0 ? "critical" : "default"}
        />
        <ScmStatCard
          label="Needs Review"
          value={data?.summary.needsReview ?? 0}
          hint="Items waiting for human follow-up."
          icon={AlertTriangle}
          tone={(data?.summary.needsReview ?? 0) > 0 ? "warning" : "default"}
        />
        <ScmStatCard
          label="Operational Risks"
          value={data?.summary.operationalRisks ?? 0}
          hint="Supply, SLA, warehouse, or delivery signals."
          icon={RefreshCw}
        />
      </div>

      <section className="space-y-4">
        <ScmSectionHeader
          title="Critical"
          description="Resolve these first. They are the most likely to cause payment errors, stock-outs, or major delays."
        />
        <ScmExceptionList
          items={data?.critical ?? []}
          empty={
            <ScmEmptyState
              title="No critical exception"
              description="There are no severe SCM exceptions in the current queue."
              icon={ShieldAlert}
            />
          }
        />
      </section>

      <section className="space-y-4">
        <ScmSectionHeader
          title="Needs Review"
          description="These issues still require a human decision, acknowledgement, or close-out."
        />
        <ScmExceptionList
          items={data?.needsReview ?? []}
          empty={
            <ScmEmptyState
              title="No review backlog"
              description="Pending confirmations, approval delays, and return close-outs are under control."
              icon={AlertTriangle}
            />
          }
        />
      </section>

      <section className="space-y-4">
        <ScmSectionHeader
          title="Operational Risks"
          description="These are live risks that may not be blocked yet, but should be watched before they escalate."
        />
        <ScmExceptionList
          items={data?.operationalRisks ?? []}
          empty={
            <ScmEmptyState
              title="No open operational risk"
              description="Warehouse transfer, supplier SLA, and delivery risk indicators are currently stable."
              icon={RefreshCw}
            />
          }
        />
      </section>
    </div>
  );
}
