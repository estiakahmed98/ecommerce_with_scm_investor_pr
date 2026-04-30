"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestorWorkflowGuide } from "@/components/investors/InvestorWorkflowGuide";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type InvestorOption = {
  id: number;
  code: string;
  name: string;
};

type ScheduleRow = {
  id: number;
  investorId: number;
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY";
  deliveryFormat: "CSV" | "PDF" | "BOTH";
  statementWindowDays: number;
  status: "ACTIVE" | "PAUSED";
  nextRunAt: string;
  lastRunAt: string | null;
  lastDispatchedAt: string | null;
  lastDispatchNote: string | null;
  investor: {
    id: number;
    code: string;
    name: string;
    status: string;
    hasActivePortalAccess: boolean;
  } | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

export default function InvestorStatementSchedulesPage() {
  const [loading, setLoading] = useState(true);
  const [investors, setInvestors] = useState<InvestorOption[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    investorId: "",
    frequency: "MONTHLY",
    deliveryFormat: "PDF",
    statementWindowDays: "30",
    nextRunAt: "",
  });

  const load = async () => {
    try {
      setLoading(true);
      const scheduleParams = new URLSearchParams();
      if (statusFilter) {
        scheduleParams.set("status", statusFilter);
      }
      if (dueOnly) {
        scheduleParams.set("dueOnly", "true");
      }

      const [investorRes, scheduleRes] = await Promise.all([
        fetch("/api/admin/investors", { cache: "no-store" }),
        fetch(
          `/api/admin/investor-statement-schedules${scheduleParams.size ? `?${scheduleParams.toString()}` : ""}`,
          { cache: "no-store" },
        ),
      ]);

      const investorPayload = await investorRes.json().catch(() => []);
      const schedulePayload = await scheduleRes.json().catch(() => ({}));

      if (!investorRes.ok) {
        throw new Error(investorPayload?.error || "Failed to load investors.");
      }
      if (!scheduleRes.ok) {
        throw new Error(schedulePayload?.error || "Failed to load statement schedules.");
      }

      setInvestors(
        (investorPayload as InvestorOption[]).map((item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
        })),
      );
      setRows((schedulePayload?.schedules || []) as ScheduleRow[]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load statement schedules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [dueOnly, statusFilter]);

  const dueCount = useMemo(
    () => rows.filter((item) => item.status === "ACTIVE" && new Date(item.nextRunAt) <= new Date()).length,
    [rows],
  );

  const createSchedule = async () => {
    try {
      const response = await fetch("/api/admin/investor-statement-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: Number(form.investorId),
          frequency: form.frequency,
          deliveryFormat: form.deliveryFormat,
          statementWindowDays: Number(form.statementWindowDays),
          nextRunAt: form.nextRunAt || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create schedule.");
      }
      toast.success("Statement schedule created");
      setForm((current) => ({
        ...current,
        investorId: "",
        nextRunAt: "",
      }));
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create schedule.");
    }
  };

  const processAction = async (id: number, action: "pause" | "resume" | "run-now") => {
    try {
      setActingId(id);
      const response = await fetch(`/api/admin/investor-statement-schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to ${action} schedule.`);
      }
      toast.success(
        action === "run-now"
          ? "Scheduled statement dispatched"
          : action === "pause"
            ? "Schedule paused"
            : "Schedule resumed",
      );
      await load();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} schedule.`);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <InvestorWorkflowGuide currentSection="statement-schedules" />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Investor Statement Schedules</h1>
        <p className="text-sm text-muted-foreground">
          Manage recurring investor statement dispatches and clear due schedule backlog.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{rows.filter((item) => item.status === "ACTIVE").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Due Now</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{dueCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Portal Ready</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{rows.filter((item) => item.investor?.hasActivePortalAccess).length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="schedule-investor">Investor</Label>
              <select
                id="schedule-investor"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.investorId}
                onChange={(event) => setForm((current) => ({ ...current, investorId: event.target.value }))}
              >
                <option value="">Select investor</option>
                {investors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-frequency">Frequency</Label>
              <select
                id="schedule-frequency"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.frequency}
                onChange={(event) => setForm((current) => ({ ...current, frequency: event.target.value }))}
              >
                <option value="WEEKLY">WEEKLY</option>
                <option value="MONTHLY">MONTHLY</option>
                <option value="QUARTERLY">QUARTERLY</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-format">Format</Label>
              <select
                id="schedule-format"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.deliveryFormat}
                onChange={(event) => setForm((current) => ({ ...current, deliveryFormat: event.target.value }))}
              >
                <option value="PDF">PDF</option>
                <option value="CSV">CSV</option>
                <option value="BOTH">BOTH</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-window">Window Days</Label>
              <Input
                id="schedule-window"
                value={form.statementWindowDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, statementWindowDays: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[240px,auto]">
            <div className="space-y-2">
              <Label htmlFor="schedule-next-run">First Run At</Label>
              <Input
                id="schedule-next-run"
                type="datetime-local"
                value={form.nextRunAt}
                onChange={(event) => setForm((current) => ({ ...current, nextRunAt: event.target.value }))}
              />
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={() => void createSchedule()} disabled={!form.investorId}>
                Create Schedule
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <select
                id="status-filter"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant={dueOnly ? "default" : "outline"} onClick={() => setDueOnly((current) => !current)}>
                {dueOnly ? "Showing Due Only" : "Due Only"}
              </Button>
              <Button variant="outline" onClick={() => void load()} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investor</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Last Dispatch</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => {
                  const due = item.status === "ACTIVE" && new Date(item.nextRunAt) <= new Date();
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.investor ? (
                          <Link href={`/admin/investors/${item.investor.id}`} className="hover:text-primary">
                            {item.investor.name} ({item.investor.code})
                          </Link>
                        ) : (
                          "Unknown investor"
                        )}
                      </TableCell>
                      <TableCell>{item.frequency}</TableCell>
                      <TableCell>{item.deliveryFormat}</TableCell>
                      <TableCell>{item.statementWindowDays} days</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          item.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
                        }`}>
                          {item.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>{fmtDate(item.nextRunAt)}</div>
                        {due ? <div className="text-xs text-amber-700">Due now</div> : null}
                      </TableCell>
                      <TableCell>{fmtDate(item.lastDispatchedAt)}</TableCell>
                      <TableCell>{item.investor?.hasActivePortalAccess ? "Ready" : "Missing"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {item.status === "ACTIVE" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void processAction(item.id, "pause")}
                              disabled={actingId === item.id}
                            >
                              Pause
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void processAction(item.id, "resume")}
                              disabled={actingId === item.id}
                            >
                              Resume
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => void processAction(item.id, "run-now")}
                            disabled={actingId === item.id || item.status !== "ACTIVE"}
                          >
                            Run Now
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                      No investor statement schedules matched the current filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
