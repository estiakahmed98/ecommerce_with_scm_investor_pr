"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

export type ScmActionItem = {
  key: string;
  module: string;
  title: string;
  description: string;
  href: string;
  status: string;
  actionLabel: string;
  priority: "critical" | "high" | "normal";
  ageDays: number;
  dueAt: string | null;
  createdAt: string;
  warehouseName: string | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function priorityLabel(priority: ScmActionItem["priority"]) {
  switch (priority) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    default:
      return "Normal";
  }
}

export function ScmActionList({
  items,
  empty,
}: {
  items: ScmActionItem[];
  empty?: ReactNode;
}) {
  if (items.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.key} className="shadow-none">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {item.module}
                  </span>
                  <ScmStatusChip status={item.status} />
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {priorityLabel(item.priority)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <Button asChild size="sm" className="md:self-center">
                <Link href={item.href}>
                  {item.actionLabel}
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                Age: {item.ageDays} day{item.ageDays === 1 ? "" : "s"}
              </span>
              {item.warehouseName ? <span>Warehouse: {item.warehouseName}</span> : null}
              <span>Created: {fmtDate(item.createdAt)}</span>
              {item.dueAt ? <span>Due: {fmtDate(item.dueAt)}</span> : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
