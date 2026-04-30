"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit3, Trash2, X, RefreshCw } from "lucide-react";
import type { VatClassOverviewRow, VatOverviewReport } from "@/lib/vat-report";
import { PdfExportButton } from "@/components/admin/PdfExportButton";

interface VatRate {
  id: number;
  VatClassId: number;
  countryCode: string;
  regionCode?: string | null;
  rate: number | string;
  inclusive: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

interface VatClass {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  rates?: VatRate[];
}

function fmtMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function fmtNumber(value: number) {
  return new Intl.NumberFormat("en-BD").format(value || 0);
}

function toPercentString(rate: number | string) {
  const n = typeof rate === "string" ? Number(rate) : rate;
  if (!Number.isFinite(n)) return "";
  return (n * 100).toString();
}

function MetricCard({
  title,
  value,
  hint,
  className = "",
}: {
  title: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden border-border/70 ${className}`}>
      <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
      <CardHeader className="pb-3">
        <CardDescription className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">
        {hint}
      </CardContent>
    </Card>
  );
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function VatReports() {
  const [report, setReport] = useState<VatOverviewReport | null>(null);
  const [vatClasses, setVatClasses] = useState<VatClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const requestIdRef = useRef(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VatClass | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateClass, setRateClass] = useState<VatClass | null>(null);
  const [editingRate, setEditingRate] = useState<VatRate | null>(null);

  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
  });

  const [rateForm, setRateForm] = useState({
    countryCode: "BD",
    regionCode: "",
    ratePercent: "",
    inclusive: false,
    startDate: "",
    endDate: "",
  });

  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const [reportRes, classesRes] = await Promise.all([
        fetch(
          `/api/vat-reports${params.toString() ? `?${params.toString()}` : ""}`,
          { cache: "no-store" },
        ),
        fetch("/api/vat-classes", { cache: "no-store" }),
      ]);

      const reportData = await reportRes.json();
      const classesData = await classesRes.json();

      if (!reportRes.ok) {
        throw new Error(reportData?.error || "Failed to load VAT report");
      }
      if (!classesRes.ok) {
        throw new Error(classesData?.error || "Failed to load VAT classes");
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      setReport(reportData);
      setVatClasses(Array.isArray(classesData) ? classesData : []);
    } catch (error: any) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      toast.error(error?.message || "Failed to load VAT dashboard");
    } finally {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", code: "", description: "" });
    setModalOpen(true);
  };

  const openEdit = (vat: VatClass) => {
    setEditing(vat);
    setForm({
      name: vat.name,
      code: vat.code,
      description: vat.description || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const openAddRate = (vat: VatClass) => {
    setRateClass(vat);
    setEditingRate(null);
    setRateForm({
      countryCode: "BD",
      regionCode: "",
      ratePercent: "",
      inclusive: false,
      startDate: "",
      endDate: "",
    });
    setRateModalOpen(true);
  };

  const openEditRate = (vat: VatClass, rate: VatRate) => {
    setRateClass(vat);
    setEditingRate(rate);
    setRateForm({
      countryCode: rate.countryCode || "BD",
      regionCode: rate.regionCode || "",
      ratePercent: toPercentString(rate.rate),
      inclusive: !!rate.inclusive,
      startDate: rate.startDate ? String(rate.startDate).slice(0, 10) : "",
      endDate: rate.endDate ? String(rate.endDate).slice(0, 10) : "",
    });
    setRateModalOpen(true);
  };

  const closeRateModal = () => {
    setRateModalOpen(false);
    setRateClass(null);
    setEditingRate(null);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Name and Code required");
      return;
    }

    try {
      setSaving(true);
      const response = editing
        ? await fetch(`/api/vat-classes/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
        : await fetch("/api/vat-classes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Failed to save VAT class");
      }

      toast.success(editing ? "VAT class updated" : "VAT class created");
      closeModal();
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleRateSubmit = async () => {
    if (!rateClass) return;

    const countryCode = rateForm.countryCode.trim().toUpperCase();
    if (countryCode.length !== 2) {
      toast.error("Country code must be 2 letters (e.g. BD)");
      return;
    }

    const percent = Number(rateForm.ratePercent);
    if (!Number.isFinite(percent) || percent < 0) {
      toast.error("Rate must be a number (e.g. 7.5)");
      return;
    }

    const payload = {
      VatClassId: rateClass.id,
      countryCode,
      regionCode: rateForm.regionCode.trim() || null,
      rate: percent / 100,
      inclusive: rateForm.inclusive,
      startDate: rateForm.startDate || null,
      endDate: rateForm.endDate || null,
    };

    try {
      setSaving(true);
      const response = editingRate
        ? await fetch(`/api/vat-rates/${editingRate.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/vat-rates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Failed to save VAT rate");
      }

      toast.success(editingRate ? "VAT rate updated" : "VAT rate created");
      closeRateModal();
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save rate");
    } finally {
      setSaving(false);
    }
  };

  const handleRateDelete = async (rateId: number) => {
    if (!confirm("Delete this VAT rate?")) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/vat-rates/${rateId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Failed to delete VAT rate");
      }

      toast.success("VAT rate deleted");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this VAT class?")) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/vat-classes/${id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || "Failed to delete VAT class");
      }

      toast.success("VAT class deleted");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const classById = new Map<number, VatClass>();
  vatClasses.forEach((item) => classById.set(item.id, item));
  const rangeLabel =
    dateFrom && dateTo
      ? `${formatDateLabel(dateFrom)} to ${formatDateLabel(dateTo)}`
      : dateFrom
        ? `${formatDateLabel(dateFrom)} onward`
        : dateTo
          ? `Up to ${formatDateLabel(dateTo)}`
          : "All dates";

  return (
    <section className="space-y-6 p-6">
      <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-background via-muted/40 to-background p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="w-fit bg-background/80">
              VAT Dashboard
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                VAT Report and Management
              </h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Overall VAT collection, class-wise reporting, and rate
                management with order-time tax snapshots.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="px-3 py-1">Range: {rangeLabel}</Badge>
              <Badge variant="outline" className="px-3 py-1">
                {loading
                  ? "Refreshing"
                  : `${fmtNumber(report?.totals.taxedOrders || 0)} taxed orders`}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={loadData} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <PdfExportButton
              targetId="vat-overview-export"
              filename={`vat-overview${dateFrom || dateTo ? `-${dateFrom || "all"}-${dateTo || "all"}` : ""}.pdf`}
            />
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add VAT Class
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                Filter by date Range
              </h3>
              <p className="text-sm text-muted-foreground">
                The report updates automatically when the date range changes.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="vat-from">Start date</Label>
                <Input
                  id="vat-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat-to">End date</Label>
                <Input
                  id="vat-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading || !report ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx} className="overflow-hidden border-border/70">
                <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
                <CardContent className="p-6">
                  <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                  <div className="mt-4 h-8 w-40 animate-pulse rounded bg-muted/80" />
                  <div className="mt-3 h-3 w-32 animate-pulse rounded bg-muted/60" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="overflow-hidden border-border/70">
            <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
            <CardContent className="p-6">
              <div className="h-5 w-48 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-72 animate-pulse rounded bg-muted/50" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div id="vat-overview-export" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total VAT Collected"
              value={fmtMoney(report.totals.totalVatAmount)}
              hint={`${fmtNumber(report.totals.taxedOrders)} taxed orders`}
              className="bg-card/90"
            />
            <MetricCard
              title="Taxable Value"
              value={fmtMoney(report.totals.totalTaxableValue)}
              hint="Base value used for output VAT calculation"
              className="bg-card/90"
            />
            <MetricCard
              title="VAT Classes"
              value={fmtNumber(report.totals.vatClasses)}
              hint={`${fmtNumber(report.totals.productsAssigned)} products assigned`}
              className="bg-card/90"
            />
            <MetricCard
              title="Exclusive Tax Charge"
              value={fmtMoney(report.totals.totalTaxCharge)}
              hint="VAT added on top of product prices"
              className="bg-card/90"
            />
          </div>

          <Card className="overflow-hidden border-border/70">
            <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
            <CardHeader className="border-b border-border/60 bg-muted/20">
              <CardTitle>Class-wise VAT Report</CardTitle>
              <CardDescription>
                Report totals are built from saved order-time tax snapshots.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>VAT Class</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">
                        Taxable Value
                      </TableHead>
                      <TableHead className="text-right">VAT Amount</TableHead>
                      <TableHead className="text-right">Tax Charge</TableHead>
                      <TableHead>Current Rate</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report.classes as VatClassOverviewRow[]).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No VAT class data found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.classes.map((row) => {
                        const fullClass = classById.get(row.id);
                        return (
                          <TableRow
                            key={row.id}
                            className="transition-colors hover:bg-muted/30"
                          >
                            <TableCell>
                              <div className="font-medium">{row.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.code}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtNumber(row.productCount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtNumber(row.totalOrders)}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtMoney(row.totalTaxableValue)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {fmtMoney(row.totalVatAmount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {fmtMoney(row.totalTaxCharge)}
                            </TableCell>
                            <TableCell>
                              <Badge className="rounded-full">
                                {row.latestRateLabel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    href={`/admin/management/vatmanagent/${row.id}`}
                                  >
                                    View Report
                                  </Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    fullClass && openEdit(fullClass)
                                  }
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {vatClasses.map((vat) => (
              <Card key={vat.id} className="overflow-hidden border-border/70">
                <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
                <CardContent className="space-y-4 p-6">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">{vat.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Code: {vat.code}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {vat.description || "No description"}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Rates</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAddRate(vat)}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add Rate
                      </Button>
                    </div>

                    {(vat.rates || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No rates yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(vat.rates || []).map((rate) => (
                          <div
                            key={rate.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3"
                          >
                            <div className="text-sm">
                              <div className="font-medium">
                                {rate.countryCode}
                                {rate.regionCode
                                  ? `-${rate.regionCode}`
                                  : ""}{" "}
                                {toPercentString(rate.rate)}%
                                {rate.inclusive ? " (inclusive)" : ""}
                              </div>
                              {(rate.startDate || rate.endDate) && (
                                <div className="text-muted-foreground">
                                  {rate.startDate
                                    ? String(rate.startDate).slice(0, 10)
                                    : "-"}{" "}
                                  to{" "}
                                  {rate.endDate
                                    ? String(rate.endDate).slice(0, 10)
                                    : "-"}
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditRate(vat, rate)}
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRateDelete(rate.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/management/vatmanagent/${vat.id}`}>
                        Report
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(vat)}
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(vat.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing ? "Edit VAT Class" : "New VAT Class"}
              </h2>
              <Button size="icon" variant="ghost" onClick={closeModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Code *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              <Button
                onClick={handleSubmit}
                className="w-full"
                disabled={saving}
              >
                {saving ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {rateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeRateModal}
        >
          <div
            className="w-full max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editingRate ? "Edit VAT Rate" : "New VAT Rate"}
              </h2>
              <Button size="icon" variant="ghost" onClick={closeRateModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Class: {rateClass?.name} ({rateClass?.code})
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Country Code *</Label>
                <Input
                  value={rateForm.countryCode}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, countryCode: e.target.value })
                  }
                  placeholder="BD"
                />
              </div>

              <div className="space-y-2">
                <Label>Region Code</Label>
                <Input
                  value={rateForm.regionCode}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, regionCode: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label>Rate (%) *</Label>
                <Input
                  type="number"
                  value={rateForm.ratePercent}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, ratePercent: e.target.value })
                  }
                  placeholder="7.5"
                />
              </div>

              <div className="flex items-center gap-2 pt-8">
                <input
                  id="inclusive"
                  type="checkbox"
                  checked={rateForm.inclusive}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, inclusive: e.target.checked })
                  }
                />
                <Label htmlFor="inclusive">Inclusive</Label>
              </div>

              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={rateForm.startDate}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, startDate: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={rateForm.endDate}
                  onChange={(e) =>
                    setRateForm({ ...rateForm, endDate: e.target.value })
                  }
                />
              </div>
            </div>

            <Button
              onClick={handleRateSubmit}
              className="w-full"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingRate
                  ? "Update Rate"
                  : "Create Rate"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
