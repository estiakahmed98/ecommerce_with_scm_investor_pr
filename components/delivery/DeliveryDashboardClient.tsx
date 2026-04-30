"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeliveryAssignmentCard } from "@/components/delivery/DeliveryAssignmentCard";
import { DeliveryDashboardSkeleton } from "@/components/ui/DeliveryDashboardSkeleton";
import type {
  DeliveryAssignmentData,
  DeliveryAssignmentsApiResponse,
  DeliveryAssignmentStatusValue,
} from "@/components/delivery/types";

type TabKey =
  | "newlyAssigned"
  | "accepted"
  | "rejected"
  | "pickedUp"
  | "inTransit"
  | "delivered"
  | "exceptions";

const TAB_DEFINITIONS: Array<{
  key: TabKey;
  label: string;
  statuses: DeliveryAssignmentStatusValue[];
}> = [
  { key: "newlyAssigned", label: "Newly Assigned", statuses: ["ASSIGNED"] },
  { key: "accepted", label: "Accepted Deliveries", statuses: ["ACCEPTED"] },
  { key: "rejected", label: "Rejected Deliveries", statuses: ["REJECTED"] },
  { key: "pickedUp", label: "Picked Up", statuses: ["PICKUP_CONFIRMED"] },
  {
    key: "inTransit",
    label: "In Transit",
    statuses: ["IN_TRANSIT", "OUT_FOR_DELIVERY"],
  },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "exceptions", label: "Exceptions", statuses: ["FAILED", "RETURNED"] },
];

const SUMMARY_CARD_STYLES: Record<string, string> = {
  Assigned: "delivery-summary-card delivery-summary-card-assigned",
  Accepted: "delivery-summary-card delivery-summary-card-accepted",
  Rejected: "delivery-summary-card delivery-summary-card-rejected",
  "Picked From Warehouse":
    "delivery-summary-card delivery-summary-card-picked-from-warehouse",
  "In Transit": "delivery-summary-card delivery-summary-card-in-transit",
  Delivered: "delivery-summary-card delivery-summary-card-delivered",
};

export function DeliveryDashboardClient() {
  const [assignments, setAssignments] = useState<DeliveryAssignmentData[]>([]);
  const [summary, setSummary] = useState({
    assigned: 0,
    accepted: 0,
    rejected: 0,
    pickedFromWarehouse: 0,
    inTransit: 0,
    delivered: 0,
  });
  const [activeTab, setActiveTab] = useState<TabKey>("newlyAssigned");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadAssignments(showRefreshing = false) {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      const response = await fetch("/api/delivery-assignments?scope=mine&limit=200", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<DeliveryAssignmentsApiResponse>;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || "Failed to load delivery dashboard");
      }

      setAssignments(payload.data.assignments || []);
      setSummary(payload.data.summary || summary);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load delivery dashboard",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAssignments();
  }, []);

  const groupedAssignments = useMemo(() => {
    return TAB_DEFINITIONS.reduce<Record<TabKey, DeliveryAssignmentData[]>>(
      (accumulator, definition) => {
        accumulator[definition.key] = assignments.filter((assignment) =>
          definition.statuses.includes(assignment.status),
        );
        return accumulator;
      },
      {
        newlyAssigned: [],
        accepted: [],
        rejected: [],
        pickedUp: [],
        inTransit: [],
        delivered: [],
        exceptions: [],
      },
    );
  }, [assignments]);

  const summaryCards = [
    { label: "Assigned", value: summary.assigned },
    { label: "Accepted", value: summary.accepted },
    { label: "Rejected", value: summary.rejected },
    { label: "Picked From Warehouse", value: summary.pickedFromWarehouse },
    { label: "In Transit", value: summary.inTransit },
    { label: "Delivered", value: summary.delivered },
  ];

  if (loading) {
    return <DeliveryDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto space-y-6">
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Delivery Operations
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-foreground">
                Delivery Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Review newly assigned deliveries, confirm warehouse pickup, and keep shipment
                status up to date from a mobile-friendly operational workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadAssignments(true)}
              className="btn-outline rounded-xl px-4 py-3 text-sm font-medium"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {summaryCards.map((card) => (
            <article
              key={card.label}
              className={`rounded-3xl border border-border p-5 shadow-sm ${
                SUMMARY_CARD_STYLES[card.label] ?? "delivery-summary-card"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {card.label}
              </p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{card.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
            <TabsList className="w-full justify-start overflow-x-auto rounded-2xl bg-background p-2 scrollbar-hide">
              {TAB_DEFINITIONS.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key} className="rounded-xl">
                  {tab.label}
                  <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">
                    {groupedAssignments[tab.key].length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TAB_DEFINITIONS.map((tab) => (
              <TabsContent key={tab.key} value={tab.key} className="mt-6">
                {groupedAssignments[tab.key].length ? (
                  <div className="space-y-5">
                    {groupedAssignments[tab.key].map((assignment) => (
                      <DeliveryAssignmentCard
                        key={assignment.id}
                        assignment={assignment}
                        onChanged={async (message) => {
                          setNotice(message);
                          await loadAssignments(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-border bg-background px-6 py-14 text-center">
                    <p className="text-lg font-medium text-foreground">
                      No deliveries in {tab.label.toLowerCase()}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      New assignment and status updates will appear here automatically.
                    </p>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </section>
      </div>
    </div>
  );
}
