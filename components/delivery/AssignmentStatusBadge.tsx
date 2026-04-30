"use client";

import { cn } from "@/lib/utils";
import type { DeliveryAssignmentStatusValue } from "@/components/delivery/types";

const STATUS_STYLES: Record<DeliveryAssignmentStatusValue, string> = {
  ASSIGNED: "border-amber-200 bg-amber-50 text-amber-700",
  ACCEPTED: "border-sky-200 bg-sky-50 text-sky-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
  PICKUP_CONFIRMED: "border-violet-200 bg-violet-50 text-violet-700",
  IN_TRANSIT: "border-blue-200 bg-blue-50 text-blue-700",
  OUT_FOR_DELIVERY: "border-indigo-200 bg-indigo-50 text-indigo-700",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  RETURNED: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

export const ASSIGNMENT_STATUS_LABELS: Record<DeliveryAssignmentStatusValue, string> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  PICKUP_CONFIRMED: "Picked Up",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out For Delivery",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  RETURNED: "Returned",
};

export function AssignmentStatusBadge({
  status,
  className,
}: {
  status: DeliveryAssignmentStatusValue;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {ASSIGNMENT_STATUS_LABELS[status]}
    </span>
  );
}
