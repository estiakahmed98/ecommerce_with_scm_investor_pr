"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ScmStatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "critical" | "warning" | "success";
  className?: string;
};

const toneMap: Record<NonNullable<ScmStatCardProps["tone"]>, string> = {
  default: "border-border",
  critical: "border-red-200 bg-red-50/60",
  warning: "border-amber-200 bg-amber-50/60",
  success: "border-emerald-200 bg-emerald-50/60",
};

export function ScmStatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: ScmStatCardProps) {
  return (
    <Card className={cn("shadow-none", toneMap[tone], className)}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className="rounded-xl border border-border/70 bg-background/80 p-2.5">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
