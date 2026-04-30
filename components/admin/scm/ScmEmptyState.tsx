"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type ScmEmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
};

export function ScmEmptyState({
  title,
  description,
  icon: Icon,
}: ScmEmptyStateProps) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-start gap-3 p-6">
        {Icon ? (
          <div className="rounded-xl border border-border bg-muted/30 p-2.5">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : null}
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
