"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

export type ScmExceptionItem = {
  key: string;
  module: string;
  title: string;
  description: string;
  href: string;
  severity: "critical" | "high" | "medium";
  status: string;
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

function severityClasses(severity: ScmExceptionItem["severity"]) {
  switch (severity) {
    case "critical":
      return "border-red-200 bg-red-50/60";
    case "high":
      return "border-amber-200 bg-amber-50/60";
    default:
      return "border-sky-200 bg-sky-50/60";
  }
}

export function ScmExceptionList({
  items,
  empty,
}: {
  items: ScmExceptionItem[];
  empty?: ReactNode;
}) {
  if (items.length === 0) {
    return <>{empty ?? null}</>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.key} className={severityClasses(item.severity)}>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {item.module}
                  </span>
                  <ScmStatusChip status={item.status} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="bg-background">
                <Link href={item.href}>
                  Review
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span>Age: {item.ageDays} day{item.ageDays === 1 ? "" : "s"}</span>
              {item.warehouseName ? <span>Warehouse: {item.warehouseName}</span> : null}
              <span>Detected: {fmtDate(item.createdAt)}</span>
              {item.dueAt ? <span>Due: {fmtDate(item.dueAt)}</span> : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
