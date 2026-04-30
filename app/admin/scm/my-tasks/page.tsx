"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, ClipboardList, RefreshCw, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScmActionList, type ScmActionItem } from "@/components/admin/scm/ScmActionList";
import { ScmEmptyState } from "@/components/admin/scm/ScmEmptyState";
import { ScmSectionHeader } from "@/components/admin/scm/ScmSectionHeader";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";

type MyTasksResponse = {
  summary: {
    needsMyAction: number;
    waitingOnOthers: number;
    recentlyCompleted: number;
    overdue: number;
  };
  needsMyAction: ScmActionItem[];
  waitingOnOthers: ScmActionItem[];
  recentlyCompleted: ScmActionItem[];
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || fallback);
  }
  return payload as T;
}

export default function ScmMyTasksPage() {
  const [data, setData] = useState<MyTasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await readJson<MyTasksResponse>(
        await fetch("/api/scm/my-tasks", { cache: "no-store" }),
        "Failed to load your SCM task queue.",
      );
      setData(payload);
    } catch (err: any) {
      setError(err?.message || "Failed to load your SCM task queue.");
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
        title="My Tasks"
        description="This workspace shows exactly what needs your attention now, what is waiting on others, and what just finished."
        action={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {loading ? <p className="text-sm text-muted-foreground">Loading SCM task queue...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard
          label="Needs My Action"
          value={data?.summary.needsMyAction ?? 0}
          hint="Documents blocked until you act."
          icon={ClipboardCheck}
          tone={(data?.summary.needsMyAction ?? 0) > 0 ? "warning" : "default"}
        />
        <ScmStatCard
          label="Overdue"
          value={data?.summary.overdue ?? 0}
          hint="Items older than expected response time."
          icon={TimerReset}
          tone={(data?.summary.overdue ?? 0) > 0 ? "critical" : "default"}
        />
        <ScmStatCard
          label="Waiting On Others"
          value={data?.summary.waitingOnOthers ?? 0}
          hint="Your documents currently in someone else's queue."
          icon={ClipboardList}
        />
        <ScmStatCard
          label="Recently Completed"
          value={data?.summary.recentlyCompleted ?? 0}
          hint="Recent outcomes you may want to review."
          icon={RefreshCw}
        />
      </div>

      <section className="space-y-4">
        <ScmSectionHeader
          title="Needs My Action"
          description="Start here first. These are the approvals, confirmations, and workflow moves currently waiting on you."
        />
        <ScmActionList
          items={data?.needsMyAction ?? []}
          empty={
            <ScmEmptyState
              title="No immediate task assigned"
              description="Your approval and execution queue is clear for now."
              icon={ClipboardCheck}
            />
          }
        />
      </section>

      <section className="space-y-4">
        <ScmSectionHeader
          title="Waiting On Others"
          description="These are your documents that already moved forward and are now with another team or approval stage."
        />
        <ScmActionList
          items={data?.waitingOnOthers ?? []}
          empty={
            <ScmEmptyState
              title="Nothing is waiting downstream"
              description="You do not currently have SCM documents pending with another stage."
              icon={ClipboardList}
            />
          }
        />
      </section>

      <section className="space-y-4">
        <ScmSectionHeader
          title="Recently Completed"
          description="Review recent approvals, releases, and completed treasury or warehouse actions."
        />
        <ScmActionList
          items={data?.recentlyCompleted ?? []}
          empty={
            <ScmEmptyState
              title="No recent completions"
              description="Completed SCM outcomes will appear here once workflows finish."
              icon={RefreshCw}
            />
          }
        />
      </section>
    </div>
  );
}
