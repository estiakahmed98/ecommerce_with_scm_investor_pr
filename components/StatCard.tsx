"use client";

import { LucideIcon } from "lucide-react";

type Tone = "default" | "good" | "warn" | "danger";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: number;
  compareLabel: string;
  hint?: string;
  tone?: Tone;
}

function MiniTrend({
  value,
  compareLabel,
}: {
  value?: number;
  compareLabel: string;
}) {
  if (typeof value !== "number") {
    return (
      <span className="text-xs text-muted-foreground">{compareLabel}</span>
    );
  }

  const positive = value >= 0;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={
          positive
            ? "text-emerald-500 dark:text-emerald-400 [&:where(.theme-navy)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-chart-2))]"
            : "text-destructive"
        }
      >
        {positive ? "+" : "-"}
      </span>
      <span className="font-medium text-foreground">
        {Math.abs(value).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">{compareLabel}</span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  compareLabel,
  hint,
  tone = "default",
}: StatCardProps) {
  const accent =
    tone === "good"
      ? "from-emerald-200/60 to-emerald-100/40 [&:where(.theme-navy)]:from-[hsl(var(--analytics-chart-1))/0.25] [&:where(.theme-navy)]:to-[hsl(var(--analytics-chart-1))/0.12] [&:where(.theme-plum)]:from-[hsl(var(--analytics-chart-1))/0.25] [&:where(.theme-plum)]:to-[hsl(var(--analytics-chart-1))/0.12] [&:where(.theme-olive)]:from-[hsl(var(--analytics-chart-2))/0.25] [&:where(.theme-olive)]:to-[hsl(var(--analytics-chart-2))/0.12] [&:where(.theme-rose)]:from-[hsl(var(--analytics-chart-2))/0.25] [&:where(.theme-rose)]:to-[hsl(var(--analytics-chart-2))/0.12]"
      : tone === "warn"
        ? "from-amber-200/60 to-amber-100/40 [&:where(.theme-navy)]:from-[hsl(var(--analytics-chart-3))/0.25] [&:where(.theme-navy)]:to-[hsl(var(--analytics-chart-3))/0.12] [&:where(.theme-plum)]:from-[hsl(var(--analytics-chart-3))/0.25] [&:where(.theme-plum)]:to-[hsl(var(--analytics-chart-3))/0.12] [&:where(.theme-olive)]:from-[hsl(var(--analytics-accent))/0.25] [&:where(.theme-olive)]:to-[hsl(var(--analytics-accent))/0.12] [&:where(.theme-rose)]:from-[hsl(var(--analytics-chart-4))/0.25] [&:where(.theme-rose)]:to-[hsl(var(--analytics-chart-4))/0.12]"
        : tone === "danger"
          ? "from-red-200/60 to-red-100/40 [&:where(.theme-navy)]:from-[hsl(var(--analytics-chart-5))/0.25] [&:where(.theme-navy)]:to-[hsl(var(--analytics-chart-5))/0.12] [&:where(.theme-plum)]:from-[hsl(var(--analytics-chart-5))/0.25] [&:where(.theme-plum)]:to-[hsl(var(--analytics-chart-5))/0.12] [&:where(.theme-olive)]:from-[hsl(var(--analytics-chart-4))/0.25] [&:where(.theme-olive)]:to-[hsl(var(--analytics-chart-4))/0.12] [&:where(.theme-rose)]:from-[hsl(var(--analytics-chart-3))/0.25] [&:where(.theme-rose)]:to-[hsl(var(--analytics-chart-3))/0.12]"
          : "from-blue-200/60 to-blue-100/40 [&:where(.theme-navy)]:from-[hsl(var(--analytics-primary))/0.25] [&:where(.theme-navy)]:to-[hsl(var(--analytics-primary))/0.12] [&:where(.theme-plum)]:from-[hsl(var(--analytics-primary))/0.25] [&:where(.theme-plum)]:to-[hsl(var(--analytics-primary))/0.12] [&:where(.theme-olive)]:from-[hsl(var(--analytics-primary))/0.25] [&:where(.theme-olive)]:to-[hsl(var(--analytics-primary))/0.12] [&:where(.theme-rose)]:from-[hsl(var(--analytics-primary))/0.25] [&:where(.theme-rose)]:to-[hsl(var(--analytics-primary))/0.12]";

  const statusColor =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400 [&:where(.theme-navy)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-chart-2))]"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400 [&:where(.theme-navy)]:text-[hsl(var(--analytics-chart-3))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-chart-3))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-accent))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-chart-4))]"
        : tone === "danger"
          ? "text-destructive [&:where(.theme-navy)]:text-[hsl(var(--analytics-chart-5))] [&:where(.theme-plum)]:text-[hsl(var(--analytics-chart-5))] [&:where(.theme-olive)]:text-[hsl(var(--analytics-chart-4))] [&:where(.theme-rose)]:text-[hsl(var(--analytics-chart-3))]"
          : "text-foreground";

  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-border/70 bg-card/95 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.09)]">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{label}</p>
            {tone !== "default" && (
              <div
                className={`h-2 w-2 rounded-full ${
                  tone === "good"
                    ? "bg-emerald-500 [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-1))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-chart-2))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-2))]"
                    : tone === "warn"
                      ? "bg-amber-500 [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-3))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-3))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-accent))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-4))]"
                      : "bg-destructive [&:where(.theme-navy)]:bg-[hsl(var(--analytics-chart-5))] [&:where(.theme-plum)]:bg-[hsl(var(--analytics-chart-5))] [&:where(.theme-olive)]:bg-[hsl(var(--analytics-chart-4))] [&:where(.theme-rose)]:bg-[hsl(var(--analytics-chart-3))]"
                }`}
              />
            )}
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-[30px]">
            {value}
          </p>
          <div className="mt-3">
            {typeof trend === "number" ? (
              <MiniTrend value={trend} compareLabel={compareLabel} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {hint || compareLabel}
              </span>
            )}
          </div>
        </div>
        <div
          className={`rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm ${statusColor}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

export type { StatCardProps };
