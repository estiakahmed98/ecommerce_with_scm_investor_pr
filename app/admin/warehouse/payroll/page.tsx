"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarRange,
  CircleDollarSign,
  Plus,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type UserOption = {
  id: string;
  name?: string | null;
  email: string;
  phone?: string | null;
};

type WarehouseOption = {
  id: number;
  name: string;
  code: string;
};

type PayrollProfile = {
  id: number;
  userId: string;
  warehouseId?: number | null;
  employeeCode?: string | null;
  paymentType: string;
  baseSalary: string | number;
  bankName?: string | null;
  bankAccountNo?: string | null;
  accountHolder?: string | null;
  mobileBankingNo?: string | null;
  paymentMethod?: string | null;
  joiningDate?: string | null;
  isActive: boolean;
  notes?: string | null;
  user: UserOption;
  warehouse?: WarehouseOption | null;
  _count?: { entries: number };
};

type PayrollPeriod = {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  notes?: string | null;
  _count?: { entries: number };
};

type PayrollEntry = {
  id: number;
  payrollPeriodId: number;
  payrollProfileId: number;
  userId: string;
  warehouseId?: number | null;
  basicAmount: string | number;
  overtimeAmount: string | number;
  bonusAmount: string | number;
  deductionAmount: string | number;
  netAmount: string | number;
  paymentStatus: string;
  paidAt?: string | null;
  note?: string | null;
  payrollPeriod: PayrollPeriod;
  payrollProfile: PayrollProfile;
  warehouse?: WarehouseOption | null;
};

type PayrollPayload = {
  summary: {
    activeProfiles: number;
    openPeriods: number;
    paidCount: number;
    pendingCount: number;
    paidAmount: number;
    pendingAmount: number;
  };
  profiles: PayrollProfile[];
  periods: PayrollPeriod[];
  entries: PayrollEntry[];
  users: UserOption[];
  warehouses: WarehouseOption[];
};

type PayrollTab = "profiles" | "periods" | "entries";

const money = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
});

const profileDefaults = {
  userId: "",
  warehouseId: "",
  employeeCode: "",
  paymentType: "MONTHLY",
  baseSalary: "",
  bankName: "",
  bankAccountNo: "",
  accountHolder: "",
  mobileBankingNo: "",
  paymentMethod: "BANK",
  joiningDate: "",
  isActive: true,
  notes: "",
};

const periodDefaults = {
  name: "",
  startDate: "",
  endDate: "",
  status: "OPEN",
  notes: "",
};

const entryDefaults = {
  payrollProfileId: "",
  payrollPeriodId: "",
  warehouseId: "",
  basicAmount: "",
  overtimeAmount: "0",
  bonusAmount: "0",
  deductionAmount: "0",
  netAmount: "",
  paymentStatus: "PENDING",
  paidAt: "",
  note: "",
};

function amount(value: string | number | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateNetAmountValue(entry: typeof entryDefaults) {
  return String(
    amount(entry.basicAmount) +
      amount(entry.overtimeAmount) +
      amount(entry.bonusAmount) -
      amount(entry.deductionAmount),
  );
}

function formatMoney(value: string | number | null | undefined) {
  return money.format(amount(value));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function getBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
    case "PAID":
    case "OPEN":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
    case "PROCESSING":
      return "border-sky-500/20 bg-sky-500/10 text-sky-700";
    case "CLOSED":
      return "border-slate-500/20 bg-slate-500/10 text-slate-700";
    default:
      return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  }
}

function PayrollPageSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className=" space-y-6">
        <div className="rounded-[28px] border border-border/60 bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-72" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-32 rounded-full" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`payroll-summary-${index}`}
              className="rounded-[24px] border border-border/60 bg-card p-5 shadow-sm"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-9 w-20" />
              <Skeleton className="mt-3 h-4 w-32" />
            </div>
          ))}
        </div>

        <div className="rounded-[28px] border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border/60 pb-4 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-12 w-80 rounded-2xl" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-60 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
          </div>
          <div className="space-y-3 pt-4">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={`payroll-row-${index}`}
                className="grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-6"
              >
                {Array.from({ length: 6 }).map((__, innerIndex) => (
                  <Skeleton
                    key={`payroll-cell-${index}-${innerIndex}`}
                    className="h-5 w-full"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function AdminPayrollPage() {
  const [data, setData] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<PayrollTab>("profiles");
  const [submitting, setSubmitting] = useState<
    "profile" | "period" | "entry" | null
  >(null);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(profileDefaults);
  const [periodForm, setPeriodForm] = useState(periodDefaults);
  const [entryForm, setEntryForm] = useState(entryDefaults);
  const [isNetAmountManual, setIsNetAmountManual] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/payroll", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to load payroll");
      setData(payload);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to load payroll";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedProfile = useMemo(
    () =>
      data?.profiles.find(
        (item) => item.id === Number(entryForm.payrollProfileId),
      ) || null,
    [data?.profiles, entryForm.payrollProfileId],
  );

  useEffect(() => {
    if (!selectedProfile) return;
    setEntryForm((current) => ({
      ...current,
      warehouseId:
        current.warehouseId ||
        (selectedProfile.warehouseId
          ? String(selectedProfile.warehouseId)
          : ""),
      basicAmount:
        current.basicAmount || String(selectedProfile.baseSalary ?? ""),
    }));
  }, [selectedProfile]);

  useEffect(() => {
    if (isNetAmountManual) return;

    const calculatedNetAmount = calculateNetAmountValue(entryForm);
    if (entryForm.netAmount === calculatedNetAmount) return;

    setEntryForm((current) => ({
      ...current,
      netAmount: calculateNetAmountValue(current),
    }));
  }, [
    entryForm.basicAmount,
    entryForm.overtimeAmount,
    entryForm.bonusAmount,
    entryForm.deductionAmount,
    entryForm.netAmount,
    isNetAmountManual,
  ]);

  const filteredProfiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return data?.profiles ?? [];
    return (data?.profiles ?? []).filter((profile) =>
      [
        profile.user.name,
        profile.user.email,
        profile.employeeCode,
        profile.paymentType,
        profile.paymentMethod,
        profile.warehouse?.name,
        profile.warehouse?.code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [data?.profiles, searchTerm]);

  const filteredPeriods = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return data?.periods ?? [];
    return (data?.periods ?? []).filter((period) =>
      [period.name, period.status, period.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [data?.periods, searchTerm]);

  const filteredEntries = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return data?.entries ?? [];
    return (data?.entries ?? []).filter((entry) =>
      [
        entry.payrollProfile.user.name,
        entry.payrollProfile.user.email,
        entry.payrollPeriod.name,
        entry.paymentStatus,
        entry.warehouse?.name,
        entry.note,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [data?.entries, searchTerm]);

  const resetProfileModal = () => {
    setEditingProfileId(null);
    setProfileForm(profileDefaults);
    setIsProfileModalOpen(false);
  };

  const resetPeriodModal = () => {
    setEditingPeriodId(null);
    setPeriodForm(periodDefaults);
    setIsPeriodModalOpen(false);
  };

  const resetEntryModal = () => {
    setEditingEntryId(null);
    setEntryForm(entryDefaults);
    setIsNetAmountManual(false);
    setIsEntryModalOpen(false);
  };

  const openCreateModal = () => {
    setError(null);
    setSuccess(null);

    if (activeTab === "profiles") {
      setEditingProfileId(null);
      setProfileForm(profileDefaults);
      setIsProfileModalOpen(true);
      return;
    }

    if (activeTab === "periods") {
      setEditingPeriodId(null);
      setPeriodForm(periodDefaults);
      setIsPeriodModalOpen(true);
      return;
    }

    setEditingEntryId(null);
    setEntryForm(entryDefaults);
    setIsNetAmountManual(false);
    setIsEntryModalOpen(true);
  };

  const submitProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSubmitting("profile");
      setError(null);
      setSuccess(null);

      const payload = {
        entity: "profile",
        ...profileForm,
        warehouseId: profileForm.warehouseId || null,
        joiningDate: profileForm.joiningDate || null,
      };
      const url = editingProfileId
        ? `/api/payroll/profile/${editingProfileId}`
        : "/api/payroll";
      const method = editingProfileId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(response?.error || "Failed to save payroll profile");
      }

      const successMessage = editingProfileId
        ? "Payroll profile updated successfully"
        : "Payroll profile created successfully";
      toast.success(successMessage);
      setSuccess(successMessage);
      setEditingProfileId(null);
      setProfileForm(profileDefaults);
      setIsProfileModalOpen(false);
      await loadData();
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to save payroll profile";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(null);
    }
  };

  const submitPeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSubmitting("period");
      setError(null);
      setSuccess(null);

      const payload = {
        entity: "period",
        ...periodForm,
        notes: periodForm.notes || null,
      };
      const url = editingPeriodId
        ? `/api/payroll/period/${editingPeriodId}`
        : "/api/payroll";
      const method = editingPeriodId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(response?.error || "Failed to save payroll period");
      }

      const successMessage = editingPeriodId
        ? "Payroll period updated successfully"
        : "Payroll period created successfully";
      toast.success(successMessage);
      setSuccess(successMessage);
      setEditingPeriodId(null);
      setPeriodForm(periodDefaults);
      setIsPeriodModalOpen(false);
      await loadData();
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to save payroll period";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(null);
    }
  };

  const submitEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSubmitting("entry");
      setError(null);
      setSuccess(null);

      const payload = {
        entity: "entry",
        ...entryForm,
        warehouseId: entryForm.warehouseId || null,
        paidAt: entryForm.paidAt || null,
        note: entryForm.note || null,
      };
      const url = editingEntryId
        ? `/api/payroll/entry/${editingEntryId}`
        : "/api/payroll";
      const method = editingEntryId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(response?.error || "Failed to save payroll entry");
      }

      const successMessage = editingEntryId
        ? "Payroll entry updated successfully"
        : "Payroll entry created successfully";
      toast.success(successMessage);
      setSuccess(successMessage);
      setEditingEntryId(null);
      setEntryForm(entryDefaults);
      setIsNetAmountManual(false);
      setIsEntryModalOpen(false);
      await loadData();
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to save payroll entry";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(null);
    }
  };

  const summaryCards = [
    {
      label: "Active profiles",
      value: String(data?.summary.activeProfiles || 0),
      hint: `${data?.profiles.length || 0} total employees`,
      icon: Users,
    },
    {
      label: "Open periods",
      value: String(data?.summary.openPeriods || 0),
      hint: `${data?.periods.length || 0} total payroll windows`,
      icon: CalendarRange,
    },
    {
      label: "Pending payroll",
      value: formatMoney(data?.summary.pendingAmount),
      hint: `${data?.summary.pendingCount || 0} entries awaiting payout`,
      icon: Wallet,
    },
    {
      label: "Paid payroll",
      value: formatMoney(data?.summary.paidAmount),
      hint: `${data?.summary.paidCount || 0} entries already paid`,
      icon: CircleDollarSign,
    },
  ];

  if (loading && !data) {
    return <PayrollPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-border/60 bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Payroll Management
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Manage payroll profiles, payroll periods, and monthly salary
                  entries from one workspace.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => loadData()}
                className="rounded-full px-4"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                />
                Refresh
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-[24px] border border-border/60 bg-background p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {card.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-foreground">
                      {card.value}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {card.hint}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-[28px] border border-border/60 bg-card shadow-sm">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as PayrollTab)}
            className="w-full"
          >
            <div className="flex flex-col gap-4 border-b border-border/60 p-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="justify-start rounded-2xl bg-muted p-1">
                <TabsTrigger
                  value="profiles"
                  className="rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Payroll Profile
                </TabsTrigger>

                <TabsTrigger
                  value="periods"
                  className="rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Payroll Period
                </TabsTrigger>

                <TabsTrigger
                  value="entries"
                  className="rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Payroll Entry
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={`Search ${activeTab}`}
                    className="h-11 w-full min-w-0 rounded-full border border-border bg-background pl-11 pr-4 text-sm outline-none transition focus:border-primary md:w-72"
                  />
                </div>
                <Button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-full px-5"
                >
                  <Plus className="h-4 w-4" />
                  {activeTab === "profiles"
                    ? "New profile"
                    : activeTab === "periods"
                      ? "New period"
                      : "New entry"}
                </Button>
              </div>
            </div>

            <TabsContent value="profiles" className="m-0 p-4 md:p-6">
              <div className="space-y-5">
                <SectionHeader
                  title="Payroll Profiles"
                  description="Base salary, employee identity, and payout method for each staff member."
                />

                <div className="overflow-hidden rounded-[24px] border border-border/60">
                  <div className="hidden grid-cols-[1.6fr_1.3fr_1fr_1fr_1fr_auto] gap-4 border-b border-border/60 bg-muted px-5 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                    <div>Employee</div>
                    <div>Contact</div>
                    <div>Warehouse</div>
                    <div>Payment</div>
                    <div>Salary</div>
                    <div>Actions</div>
                  </div>

                  {filteredProfiles.length ? (
                    filteredProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="grid gap-4 border-b border-border/60 px-5 py-4 last:border-b-0 lg:grid-cols-[1.6fr_1.3fr_1fr_1fr_1fr_auto] lg:items-center"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {profile.user.name || profile.user.email}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profile.employeeCode || "No employee code"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-foreground">
                            {profile.user.email}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profile.user.phone || "No phone"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-foreground">
                            {profile.warehouse?.name || "No warehouse"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profile.warehouse?.code || "Unassigned"}
                          </p>
                        </div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                              getBadgeClass(
                                profile.isActive ? "ACTIVE" : "PENDING",
                              ),
                            )}
                          >
                            {profile.paymentType}
                          </span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profile.paymentMethod || "No payment method"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {formatMoney(profile.baseSalary)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {profile._count?.entries || 0} entries
                          </p>
                        </div>
                        <div className="flex justify-start lg:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingProfileId(profile.id);
                              setProfileForm({
                                userId: profile.userId,
                                warehouseId: profile.warehouseId
                                  ? String(profile.warehouseId)
                                  : "",
                                employeeCode: profile.employeeCode || "",
                                paymentType: profile.paymentType || "MONTHLY",
                                baseSalary: String(profile.baseSalary || ""),
                                bankName: profile.bankName || "",
                                bankAccountNo: profile.bankAccountNo || "",
                                accountHolder: profile.accountHolder || "",
                                mobileBankingNo: profile.mobileBankingNo || "",
                                paymentMethod: profile.paymentMethod || "",
                                joiningDate:
                                  profile.joiningDate?.slice(0, 10) || "",
                                isActive: profile.isActive,
                                notes: profile.notes || "",
                              });
                              setIsProfileModalOpen(true);
                            }}
                            className="rounded-full"
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-14 text-center text-sm text-muted-foreground">
                      No payroll profile found.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="periods" className="m-0 p-4 md:p-6">
              <div className="space-y-5">
                <SectionHeader
                  title="Payroll Periods"
                  description="Manage the payroll windows that salary entries belong to."
                />

                <div className="overflow-hidden rounded-[24px] border border-border/60">
                  <div className="hidden grid-cols-[1.8fr_1.2fr_1fr_1fr_auto] gap-4 border-b border-border/60 bg-muted px-5 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                    <div>Period</div>
                    <div>Timeline</div>
                    <div>Status</div>
                    <div>Entries</div>
                    <div>Actions</div>
                  </div>

                  {filteredPeriods.length ? (
                    filteredPeriods.map((period) => (
                      <div
                        key={period.id}
                        className="grid gap-4 border-b border-border/60 px-5 py-4 last:border-b-0 lg:grid-cols-[1.8fr_1.2fr_1fr_1fr_auto] lg:items-center"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {period.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {period.notes || "No notes"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-foreground">
                            {formatDate(period.startDate)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            to {formatDate(period.endDate)}
                          </p>
                        </div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                              getBadgeClass(period.status),
                            )}
                          >
                            {period.status}
                          </span>
                        </div>
                        <div className="text-sm text-foreground">
                          {period._count?.entries || 0}
                        </div>
                        <div className="flex justify-start lg:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingPeriodId(period.id);
                              setPeriodForm({
                                name: period.name,
                                startDate: period.startDate.slice(0, 10),
                                endDate: period.endDate.slice(0, 10),
                                status: period.status,
                                notes: period.notes || "",
                              });
                              setIsPeriodModalOpen(true);
                            }}
                            className="rounded-full"
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-14 text-center text-sm text-muted-foreground">
                      No payroll period found.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="entries" className="m-0 p-4 md:p-6">
              <div className="space-y-5">
                <SectionHeader
                  title="Payroll Entries"
                  description="Track gross-to-net salary records and payment status per payroll cycle."
                />

                <div className="overflow-hidden rounded-[24px] border border-border/60">
                  <div className="hidden grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-border/60 bg-muted px-5 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground xl:grid">
                    <div>Employee</div>
                    <div>Period</div>
                    <div>Warehouse</div>
                    <div>Breakdown</div>
                    <div>Net</div>
                    <div>Status</div>
                    <div>Actions</div>
                  </div>

                  {filteredEntries.length ? (
                    filteredEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid gap-4 border-b border-border/60 px-5 py-4 last:border-b-0 xl:grid-cols-[1.4fr_1.2fr_1fr_1fr_1fr_1fr_auto] xl:items-center"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {entry.payrollProfile.user.name ||
                              entry.payrollProfile.user.email}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.payrollProfile.user.email}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-foreground">
                            {entry.payrollPeriod.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Paid at {formatDate(entry.paidAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-foreground">
                            {entry.warehouse?.name || "No warehouse"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.warehouse?.code || "Unassigned"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-foreground">
                            Basic {formatMoney(entry.basicAmount)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            OT {formatMoney(entry.overtimeAmount)} · Bonus{" "}
                            {formatMoney(entry.bonusAmount)} · Deduction{" "}
                            {formatMoney(entry.deductionAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {formatMoney(entry.netAmount)}
                          </p>
                        </div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                              getBadgeClass(entry.paymentStatus),
                            )}
                          >
                            {entry.paymentStatus}
                          </span>
                        </div>
                        <div className="flex justify-start xl:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const nextEntryForm = {
                                payrollProfileId: String(
                                  entry.payrollProfileId,
                                ),
                                payrollPeriodId: String(entry.payrollPeriodId),
                                warehouseId: entry.warehouseId
                                  ? String(entry.warehouseId)
                                  : "",
                                basicAmount: String(entry.basicAmount || ""),
                                overtimeAmount: String(
                                  entry.overtimeAmount || 0,
                                ),
                                bonusAmount: String(entry.bonusAmount || 0),
                                deductionAmount: String(
                                  entry.deductionAmount || 0,
                                ),
                                netAmount: String(entry.netAmount || ""),
                                paymentStatus: entry.paymentStatus,
                                paidAt: entry.paidAt?.slice(0, 10) || "",
                                note: entry.note || "",
                              };
                              setEditingEntryId(entry.id);
                              setIsNetAmountManual(
                                nextEntryForm.netAmount !==
                                  calculateNetAmountValue(nextEntryForm),
                              );
                              setEntryForm(nextEntryForm);
                              setIsEntryModalOpen(true);
                            }}
                            className="rounded-full"
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-14 text-center text-sm text-muted-foreground">
                      No payroll entry found.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <Dialog
          open={isProfileModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetProfileModal();
              return;
            }
            setIsProfileModalOpen(true);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[28px] border border-border/60 p-0">
            <form onSubmit={submitProfile} className="space-y-0">
              <DialogHeader className="border-b border-border/60 px-6 py-5">
                <DialogTitle>
                  {editingProfileId
                    ? "Edit payroll profile"
                    : "New payroll profile"}
                </DialogTitle>
                <DialogDescription>
                  Configure salary details and payout preferences for a staff
                  member.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    User
                  </label>
                  <select
                    value={profileForm.userId}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, userId: e.target.value }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  >
                    <option value="">Select user</option>
                    {data?.users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Employee code
                  </label>
                  <input
                    value={profileForm.employeeCode}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        employeeCode: e.target.value,
                      }))
                    }
                    placeholder="EMP-1001"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Warehouse
                  </label>
                  <select
                    value={profileForm.warehouseId}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        warehouseId: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  >
                    <option value="">No warehouse</option>
                    {data?.warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Payment type
                  </label>
                  <select
                    value={profileForm.paymentType}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        paymentType: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  >
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="WEEKLY">WEEKLY</option>
                    <option value="DAILY">DAILY</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Base salary
                  </label>
                  <input
                    value={profileForm.baseSalary}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        baseSalary: e.target.value,
                      }))
                    }
                    placeholder="50000"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Payment method
                  </label>
                  <input
                    value={profileForm.paymentMethod}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        paymentMethod: e.target.value,
                      }))
                    }
                    placeholder="BANK / CASH / MFS"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Joining date
                  </label>
                  <input
                    type="date"
                    value={profileForm.joiningDate}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        joiningDate: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Bank name
                  </label>
                  <input
                    value={profileForm.bankName}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        bankName: e.target.value,
                      }))
                    }
                    placeholder="DBBL"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Bank account no
                  </label>
                  <input
                    value={profileForm.bankAccountNo}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        bankAccountNo: e.target.value,
                      }))
                    }
                    placeholder="1234567890"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Account holder
                  </label>
                  <input
                    value={profileForm.accountHolder}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        accountHolder: e.target.value,
                      }))
                    }
                    placeholder="Account holder"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Mobile banking no
                  </label>
                  <input
                    value={profileForm.mobileBankingNo}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        mobileBankingNo: e.target.value,
                      }))
                    }
                    placeholder="01XXXXXXXXX"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Notes
                  </label>
                  <textarea
                    value={profileForm.notes}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="Additional profile note"
                    className="min-h-28 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-foreground md:col-span-2">
                  <input
                    type="checkbox"
                    checked={profileForm.isActive}
                    onChange={(e) =>
                      setProfileForm((f) => ({
                        ...f,
                        isActive: e.target.checked,
                      }))
                    }
                  />
                  Profile active
                </label>
              </div>

              <DialogFooter className="border-t border-border/60 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetProfileModal}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting === "profile"}
                  className="rounded-full"
                >
                  {submitting === "profile"
                    ? "Saving..."
                    : editingProfileId
                      ? "Update profile"
                      : "Create profile"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isPeriodModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetPeriodModal();
              return;
            }
            setIsPeriodModalOpen(true);
          }}
        >
          <DialogContent className="max-w-2xl rounded-[28px] border border-border/60 p-0">
            <form onSubmit={submitPeriod} className="space-y-0">
              <DialogHeader className="border-b border-border/60 px-6 py-5">
                <DialogTitle>
                  {editingPeriodId
                    ? "Edit payroll period"
                    : "New payroll period"}
                </DialogTitle>
                <DialogDescription>
                  Define the payroll window and lifecycle status for salary
                  processing.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Period name
                  </label>
                  <input
                    value={periodForm.name}
                    onChange={(e) =>
                      setPeriodForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="March 2026 Payroll"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={periodForm.startDate}
                    onChange={(e) =>
                      setPeriodForm((f) => ({
                        ...f,
                        startDate: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    End date
                  </label>
                  <input
                    type="date"
                    value={periodForm.endDate}
                    onChange={(e) =>
                      setPeriodForm((f) => ({
                        ...f,
                        endDate: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Status
                  </label>
                  <select
                    value={periodForm.status}
                    onChange={(e) =>
                      setPeriodForm((f) => ({ ...f, status: e.target.value }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="PROCESSING">PROCESSING</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Notes
                  </label>
                  <textarea
                    value={periodForm.notes}
                    onChange={(e) =>
                      setPeriodForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="Optional payroll period notes"
                    className="min-h-28 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-border/60 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetPeriodModal}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting === "period"}
                  className="rounded-full"
                >
                  {submitting === "period"
                    ? "Saving..."
                    : editingPeriodId
                      ? "Update period"
                      : "Create period"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={isEntryModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetEntryModal();
              return;
            }
            setIsEntryModalOpen(true);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[28px] border border-border/60 p-0">
            <form onSubmit={submitEntry} className="space-y-0">
              <DialogHeader className="border-b border-border/60 px-6 py-5">
                <DialogTitle>
                  {editingEntryId ? "Edit payroll entry" : "New payroll entry"}
                </DialogTitle>
                <DialogDescription>
                  Record salary, overtime, bonus, deduction, and net payout
                  details.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Payroll profile
                  </label>
                  <select
                    value={entryForm.payrollProfileId}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        payrollProfileId: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  >
                    <option value="">Select payroll profile</option>
                    {data?.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.user.name || profile.user.email} ·{" "}
                        {formatMoney(profile.baseSalary)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Payroll period
                  </label>
                  <select
                    value={entryForm.payrollPeriodId}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        payrollPeriodId: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  >
                    <option value="">Select payroll period</option>
                    {data?.periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name} ({period.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Warehouse
                  </label>
                  <select
                    value={entryForm.warehouseId}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        warehouseId: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  >
                    <option value="">No warehouse</option>
                    {data?.warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Payment status
                  </label>
                  <select
                    value={entryForm.paymentStatus}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        paymentStatus: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="PAID">PAID</option>
                    <option value="PROCESSING">PROCESSING</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Basic amount
                  </label>
                  <input
                    value={entryForm.basicAmount}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        basicAmount: e.target.value,
                      }))
                    }
                    placeholder="50000"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Overtime amount
                  </label>
                  <input
                    value={entryForm.overtimeAmount}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        overtimeAmount: e.target.value,
                      }))
                    }
                    placeholder="0"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Bonus amount
                  </label>
                  <input
                    value={entryForm.bonusAmount}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        bonusAmount: e.target.value,
                      }))
                    }
                    placeholder="0"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Deduction amount
                  </label>
                  <input
                    value={entryForm.deductionAmount}
                    onChange={(e) =>
                      setEntryForm((f) => ({
                        ...f,
                        deductionAmount: e.target.value,
                      }))
                    }
                    placeholder="0"
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="rounded-[24px] border border-border/60 bg-muted p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Net amount
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Auto-calculated from basic + overtime + bonus -
                          deduction.
                        </p>
                      </div>
                      <div className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                        Auto preview{" "}
                        {formatMoney(calculateNetAmountValue(entryForm))}
                      </div>
                    </div>

                    <input
                      value={entryForm.netAmount}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setIsNetAmountManual(nextValue.trim() !== "");
                        setEntryForm((f) => ({ ...f, netAmount: nextValue }));
                      }}
                      placeholder="Net amount (optional auto-calc)"
                      className="mt-4 h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Paid date
                  </label>
                  <input
                    type="date"
                    value={entryForm.paidAt}
                    onChange={(e) =>
                      setEntryForm((f) => ({ ...f, paidAt: e.target.value }))
                    }
                    className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Notes
                  </label>
                  <textarea
                    value={entryForm.note}
                    onChange={(e) =>
                      setEntryForm((f) => ({ ...f, note: e.target.value }))
                    }
                    placeholder="Optional payroll entry note"
                    className="min-h-28 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm"
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-border/60 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetEntryModal}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting === "entry"}
                  className="rounded-full"
                >
                  {submitting === "entry"
                    ? "Saving..."
                    : editingEntryId
                      ? "Update entry"
                      : "Create entry"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
