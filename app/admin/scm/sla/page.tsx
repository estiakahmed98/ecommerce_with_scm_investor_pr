"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

type Supplier = {
  id: number;
  name: string;
  code: string;
};

type SlaPolicy = {
  id: number;
  supplierId: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  evaluationWindowDays: number;
  minTrackedPoCount: number;
  targetLeadTimeDays: number;
  minimumOnTimeRate: number | string;
  minimumFillRate: number | string;
  maxOpenLatePoCount: number;
  autoEvaluationEnabled: boolean;
  warningActionDueDays: number;
  breachActionDueDays: number;
  terminationClauseEnabled: boolean;
  terminationLookbackDays: number;
  terminationMinBreachCount: number;
  terminationMinCriticalCount: number;
  terminationRecommendedAction:
    | "WATCHLIST"
    | "SUSPEND_NEW_PO"
    | "REVIEW_CONTRACT"
    | "TERMINATE_RELATIONSHIP";
  terminationNote: string | null;
  note: string | null;
  financialRule: {
    id: number;
    isActive: boolean;
    holdPaymentsOnThreeWayVariance: boolean;
    holdPaymentsOnOpenSlaAction: boolean;
    allowPaymentHoldOverride: boolean;
    autoCreditRecommendationEnabled: boolean;
    autoApplyRecommendedCredit: boolean;
    autoApplyRequireMatchedInvoice: boolean;
    autoApplyBlockOnOpenDispute: boolean;
    warningPenaltyRatePercent: number | string;
    breachPenaltyRatePercent: number | string;
    criticalPenaltyRatePercent: number | string;
    minBreachCountForCredit: number;
    autoApplyMaxAmount: number | string | null;
    maxCreditCapAmount: number | string | null;
    note: string | null;
  } | null;
  supplier: {
    id: number;
    name: string;
    code: string;
    isActive: boolean;
    leadTimeDays: number | null;
    paymentTermsDays: number | null;
  };
};

type SlaBreach = {
  id: number;
  supplierSlaPolicyId: number;
  supplierId: number;
  evaluationDate: string;
  periodStart: string;
  periodEnd: string;
  trackedPoCount: number;
  completedPoCount: number;
  openLatePoCount: number;
  breachCount: number;
  status: "OK" | "WARNING" | "BREACH";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  observedLeadTimeDays: number | string | null;
  onTimeRatePercent: number | string | null;
  fillRatePercent: number | string | null;
  actionStatus: "NOT_REQUIRED" | "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  ownerUserId: string | null;
  dueDate: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  alertTriggeredAt: string | null;
  alertMessage: string | null;
  alertAcknowledgedAt: string | null;
  disputeStatus: "NONE" | "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED";
  disputeReason: string | null;
  disputeRaisedAt: string | null;
  disputeRaisedById: string | null;
  disputeResolutionNote: string | null;
  disputeResolvedAt: string | null;
  disputeResolvedById: string | null;
  terminationCaseId: number | null;
  terminationSuggestedAt: string | null;
  terminationSuggestionNote: string | null;
  issues: unknown;
  supplier: {
    id: number;
    name: string;
    code: string;
  };
  policy: {
    id: number;
    targetLeadTimeDays: number;
    minimumOnTimeRate: number | string;
    minimumFillRate: number | string;
    maxOpenLatePoCount: number;
    minTrackedPoCount: number;
    evaluationWindowDays: number;
    isActive: boolean;
  };
  evaluatedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  owner: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  resolvedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  disputeRaisedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  disputeResolvedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  terminationCase: {
    id: number;
    status: "OPEN" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXECUTED";
    recommendedAction:
      | "WATCHLIST"
      | "SUSPEND_NEW_PO"
      | "REVIEW_CONTRACT"
      | "TERMINATE_RELATIONSHIP";
    openBreachCount: number;
    criticalBreachCount: number;
    lookbackDays: number;
    reason: string;
    ownerUserId: string | null;
    reviewedAt: string | null;
    resolvedAt: string | null;
    resolvedById: string | null;
    resolutionNote: string | null;
    owner: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  } | null;
};

type TerminationCase = {
  id: number;
  supplierId: number;
  supplierSlaPolicyId: number;
  triggerBreachId: number | null;
  status: "OPEN" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "EXECUTED";
  recommendedAction:
    | "WATCHLIST"
    | "SUSPEND_NEW_PO"
    | "REVIEW_CONTRACT"
    | "TERMINATE_RELATIONSHIP";
  openBreachCount: number;
  criticalBreachCount: number;
  lookbackDays: number;
  reason: string;
  ownerUserId: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  createdAt: string;
  supplier: {
    id: number;
    name: string;
    code: string;
  };
  owner: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

type SlaAnalytics = {
  range: {
    from: string;
    to: string;
    days: number;
    supplierId: number | null;
  };
  summary: {
    totalEvaluations: number;
    warningCount: number;
    breachCount: number;
    criticalBreachCount: number;
    openActionCount: number;
    overdueActionCount: number;
    openDisputeCount: number;
    openTerminationCaseCount: number;
    heldInvoiceCount: number;
    overriddenInvoiceCount: number;
    recommendedCreditAmount: string;
    appliedCreditAmount: string;
    autoAppliedCreditAmount: string;
    manualAppliedCreditAmount: string;
    waivedCreditCount: number;
    notificationEventCount: number;
  };
  trends: Array<{
    date: string;
    OK: number;
    WARNING: number;
    BREACH: number;
  }>;
  topSuppliers: Array<{
    supplierId: number;
    supplierName: string;
    supplierCode: string;
    evaluations: number;
    warningCount: number;
    breachCount: number;
    criticalCount: number;
    openActions: number;
    openDisputes: number;
    lastEvaluationAt: string | null;
  }>;
  recentNotificationEvents: Array<{
    id: string;
    action: string;
    entity: string;
    createdAt: string;
  }>;
};

type SlaOwner = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  userRoles: Array<{
    scopeType: string;
    warehouseId: number | null;
    role: {
      id: string;
      name: string;
      label: string;
    };
  }>;
};

type SlaFormState = {
  supplierId: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  evaluationWindowDays: string;
  minTrackedPoCount: string;
  targetLeadTimeDays: string;
  minimumOnTimeRate: string;
  minimumFillRate: string;
  maxOpenLatePoCount: string;
  autoEvaluationEnabled: boolean;
  warningActionDueDays: string;
  breachActionDueDays: string;
  terminationClauseEnabled: boolean;
  terminationLookbackDays: string;
  terminationMinBreachCount: string;
  terminationMinCriticalCount: string;
  terminationRecommendedAction: "WATCHLIST" | "SUSPEND_NEW_PO" | "REVIEW_CONTRACT" | "TERMINATE_RELATIONSHIP";
  terminationNote: string;
  financialRuleActive: boolean;
  holdPaymentsOnThreeWayVariance: boolean;
  holdPaymentsOnOpenSlaAction: boolean;
  allowPaymentHoldOverride: boolean;
  autoCreditRecommendationEnabled: boolean;
  autoApplyRecommendedCredit: boolean;
  autoApplyRequireMatchedInvoice: boolean;
  autoApplyBlockOnOpenDispute: boolean;
  warningPenaltyRatePercent: string;
  breachPenaltyRatePercent: string;
  criticalPenaltyRatePercent: string;
  minBreachCountForCredit: string;
  autoApplyMaxAmount: string;
  maxCreditCapAmount: string;
  financialRuleNote: string;
  note: string;
};

type BreachActionDraft = {
  ownerUserId: string;
  dueDate: string;
  actionStatus: SlaBreach["actionStatus"];
  resolutionNote: string;
  acknowledgeAlert: boolean;
  disputeStatus: SlaBreach["disputeStatus"];
  disputeReason: string;
  disputeResolutionNote: string;
};

type TerminationDraft = {
  ownerUserId: string;
  status: TerminationCase["status"];
  recommendedAction: TerminationCase["recommendedAction"];
  resolutionNote: string;
  markReviewed: boolean;
};

const DEFAULT_FORM: SlaFormState = {
  supplierId: "",
  isActive: true,
  effectiveFrom: "",
  effectiveTo: "",
  evaluationWindowDays: "90",
  minTrackedPoCount: "3",
  targetLeadTimeDays: "7",
  minimumOnTimeRate: "90",
  minimumFillRate: "95",
  maxOpenLatePoCount: "0",
  autoEvaluationEnabled: true,
  warningActionDueDays: "7",
  breachActionDueDays: "3",
  terminationClauseEnabled: false,
  terminationLookbackDays: "180",
  terminationMinBreachCount: "3",
  terminationMinCriticalCount: "1",
  terminationRecommendedAction: "REVIEW_CONTRACT",
  terminationNote: "",
  financialRuleActive: true,
  holdPaymentsOnThreeWayVariance: true,
  holdPaymentsOnOpenSlaAction: true,
  allowPaymentHoldOverride: true,
  autoCreditRecommendationEnabled: true,
  autoApplyRecommendedCredit: false,
  autoApplyRequireMatchedInvoice: true,
  autoApplyBlockOnOpenDispute: true,
  warningPenaltyRatePercent: "0",
  breachPenaltyRatePercent: "2",
  criticalPenaltyRatePercent: "5",
  minBreachCountForCredit: "1",
  autoApplyMaxAmount: "",
  maxCreditCapAmount: "",
  financialRuleNote: "",
  note: "",
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

function fmtDate(value: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function fmtValue(value: number | string | null, suffix = "") {
  if (value === null || value === "") return "-";
  return `${value}${suffix}`;
}

function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getIssues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((issue) => (typeof issue === "string" ? issue : ""))
    .filter((issue) => issue.length > 0);
}

function getStatusVariant(status: SlaBreach["status"]) {
  if (status === "OK") return "default" as const;
  if (status === "WARNING") return "secondary" as const;
  return "destructive" as const;
}

function getSeverityVariant(severity: SlaBreach["severity"]) {
  if (severity === "LOW") return "outline" as const;
  if (severity === "MEDIUM") return "secondary" as const;
  if (severity === "HIGH") return "destructive" as const;
  return "destructive" as const;
}

function getActionVariant(status: SlaBreach["actionStatus"]) {
  if (status === "NOT_REQUIRED") return "outline" as const;
  if (status === "OPEN") return "secondary" as const;
  if (status === "IN_PROGRESS") return "default" as const;
  return "destructive" as const;
}

function toActionDraft(row: SlaBreach): BreachActionDraft {
  return {
    ownerUserId: row.ownerUserId ?? "",
    dueDate: toDateInput(row.dueDate),
    actionStatus: row.actionStatus,
    resolutionNote: row.resolutionNote ?? "",
    acknowledgeAlert: Boolean(row.alertTriggeredAt && !row.alertAcknowledgedAt),
    disputeStatus: row.disputeStatus,
    disputeReason: row.disputeReason ?? "",
    disputeResolutionNote: row.disputeResolutionNote ?? "",
  };
}

function toTerminationDraft(row: TerminationCase): TerminationDraft {
  return {
    ownerUserId: row.ownerUserId ?? "",
    status: row.status,
    recommendedAction: row.recommendedAction,
    resolutionNote: row.resolutionNote ?? "",
    markReviewed: false,
  };
}

export default function SupplierSlaPage() {
  const { data: session } = useSession();
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];

  const canRead = globalPermissions.some((permission) =>
    ["sla.read", "sla.manage"].includes(permission),
  );
  const canManage = globalPermissions.includes("sla.manage");
  const canManageNotifications =
    globalPermissions.includes("sla.manage") ||
    globalPermissions.includes("sla.notifications.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [actionSavingId, setActionSavingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [owners, setOwners] = useState<SlaOwner[]>([]);
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [breaches, setBreaches] = useState<SlaBreach[]>([]);
  const [terminationCases, setTerminationCases] = useState<TerminationCase[]>([]);
  const [analytics, setAnalytics] = useState<SlaAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsDays, setAnalyticsDays] = useState("90");
  const [notifying, setNotifying] = useState(false);
  const [actionDrafts, setActionDrafts] = useState<Record<number, BreachActionDraft>>({});
  const [terminationDrafts, setTerminationDrafts] = useState<Record<number, TerminationDraft>>({});
  const [terminationSavingId, setTerminationSavingId] = useState<number | null>(null);
  const [form, setForm] = useState<SlaFormState>(DEFAULT_FORM);

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const response = await fetch(`/api/scm/sla/analytics?days=${Number(analyticsDays) || 90}`, {
        cache: "no-store",
      });
      const data = await readJson<SlaAnalytics>(response, "Failed to load SLA analytics");
      setAnalytics(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load SLA analytics");
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setAnalyticsLoading(true);
      const responses = await Promise.all([
        fetch("/api/scm/suppliers", { cache: "no-store" }),
        fetch("/api/scm/sla/policies?includeInactive=1", { cache: "no-store" }),
        fetch("/api/scm/sla/breaches?latest=1&days=365", { cache: "no-store" }),
        fetch("/api/scm/sla/termination-cases?limit=200", { cache: "no-store" }),
        fetch(`/api/scm/sla/analytics?days=${Number(analyticsDays) || 90}`, { cache: "no-store" }),
        canManage ? fetch("/api/scm/sla/owners", { cache: "no-store" }) : Promise.resolve(null),
      ]);

      const [supplierRes, policyRes, breachRes, terminationRes, analyticsRes, ownerRes] = responses;

      const supplierData = await readJson<Supplier[]>(
        supplierRes,
        "Failed to load suppliers",
      );
      const policyData = await readJson<SlaPolicy[]>(
        policyRes,
        "Failed to load SLA policies",
      );
      const breachData = await readJson<SlaBreach[]>(
        breachRes,
        "Failed to load SLA breach logs",
      );
      const terminationData = await readJson<TerminationCase[]>(
        terminationRes,
        "Failed to load SLA termination cases",
      );
      const analyticsData = await readJson<SlaAnalytics>(
        analyticsRes,
        "Failed to load SLA analytics",
      );
      const ownerData = ownerRes
        ? await readJson<SlaOwner[]>(ownerRes, "Failed to load SLA owners")
        : [];

      setSuppliers(Array.isArray(supplierData) ? supplierData : []);
      setPolicies(Array.isArray(policyData) ? policyData : []);
      setBreaches(Array.isArray(breachData) ? breachData : []);
      setTerminationCases(Array.isArray(terminationData) ? terminationData : []);
      setAnalytics(analyticsData || null);
      setOwners(Array.isArray(ownerData) ? ownerData : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load SLA workspace");
      setPolicies([]);
      setBreaches([]);
      setTerminationCases([]);
      setAnalytics(null);
      setOwners([]);
    } finally {
      setLoading(false);
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (canRead) {
      void loadData();
    }
  }, [canRead, analyticsDays]);

  useEffect(() => {
    const nextDrafts: Record<number, BreachActionDraft> = {};
    for (const breach of breaches) {
      nextDrafts[breach.id] = toActionDraft(breach);
    }
    setActionDrafts(nextDrafts);
  }, [breaches]);

  useEffect(() => {
    const nextDrafts: Record<number, TerminationDraft> = {};
    for (const row of terminationCases) {
      nextDrafts[row.id] = toTerminationDraft(row);
    }
    setTerminationDrafts(nextDrafts);
  }, [terminationCases]);

  const visibleBreaches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return breaches.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (!query) return true;
      return (
        row.supplier.name.toLowerCase().includes(query) ||
        row.supplier.code.toLowerCase().includes(query)
      );
    });
  }, [breaches, search, statusFilter]);

  const submitPolicy = async () => {
    if (!canManage) return;
    if (!form.supplierId) {
      toast.error("Supplier is required");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/scm/sla/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: Number(form.supplierId),
          isActive: form.isActive,
          effectiveFrom: form.effectiveFrom || null,
          effectiveTo: form.effectiveTo || null,
          evaluationWindowDays: Number(form.evaluationWindowDays),
          minTrackedPoCount: Number(form.minTrackedPoCount),
          targetLeadTimeDays: Number(form.targetLeadTimeDays),
          minimumOnTimeRate: Number(form.minimumOnTimeRate),
          minimumFillRate: Number(form.minimumFillRate),
          maxOpenLatePoCount: Number(form.maxOpenLatePoCount),
          autoEvaluationEnabled: form.autoEvaluationEnabled,
          warningActionDueDays: Number(form.warningActionDueDays),
          breachActionDueDays: Number(form.breachActionDueDays),
          terminationClauseEnabled: form.terminationClauseEnabled,
          terminationLookbackDays: Number(form.terminationLookbackDays),
          terminationMinBreachCount: Number(form.terminationMinBreachCount),
          terminationMinCriticalCount: Number(form.terminationMinCriticalCount),
          terminationRecommendedAction: form.terminationRecommendedAction,
          terminationNote: form.terminationNote || null,
          financialRuleActive: form.financialRuleActive,
          holdPaymentsOnThreeWayVariance: form.holdPaymentsOnThreeWayVariance,
          holdPaymentsOnOpenSlaAction: form.holdPaymentsOnOpenSlaAction,
          allowPaymentHoldOverride: form.allowPaymentHoldOverride,
          autoCreditRecommendationEnabled: form.autoCreditRecommendationEnabled,
          autoApplyRecommendedCredit: form.autoApplyRecommendedCredit,
          autoApplyRequireMatchedInvoice: form.autoApplyRequireMatchedInvoice,
          autoApplyBlockOnOpenDispute: form.autoApplyBlockOnOpenDispute,
          warningPenaltyRatePercent: Number(form.warningPenaltyRatePercent),
          breachPenaltyRatePercent: Number(form.breachPenaltyRatePercent),
          criticalPenaltyRatePercent: Number(form.criticalPenaltyRatePercent),
          minBreachCountForCredit: Number(form.minBreachCountForCredit),
          autoApplyMaxAmount: form.autoApplyMaxAmount ? Number(form.autoApplyMaxAmount) : null,
          maxCreditCapAmount: form.maxCreditCapAmount ? Number(form.maxCreditCapAmount) : null,
          financialRuleNote: form.financialRuleNote || null,
          note: form.note || null,
        }),
      });

      await readJson<SlaPolicy>(response, "Failed to save SLA policy");
      toast.success(editingPolicyId ? "SLA policy updated" : "SLA policy created");
      setEditingPolicyId(null);
      setForm(DEFAULT_FORM);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save SLA policy");
    } finally {
      setSaving(false);
    }
  };

  const runEvaluation = async (supplierId?: number) => {
    if (!canManage) return;
    try {
      setRunning(true);
      const response = await fetch("/api/scm/sla/breaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierId ? { supplierId } : {}),
      });
      const data = await readJson<{ count: number }>(response, "Failed to run SLA evaluation");
      toast.success(`SLA evaluation completed for ${data.count} policy${data.count === 1 ? "" : "ies"}`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to run SLA evaluation");
    } finally {
      setRunning(false);
    }
  };

  const runNotifications = async () => {
    if (!canManageNotifications) return;
    try {
      setNotifying(true);
      const response = await fetch("/api/scm/sla/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun: false,
          dueInHours: 24,
          includeTermination: true,
          maxItems: 120,
        }),
      });
      const result = await readJson<{
        processedCount: number;
        emailedCount: number;
        webhookCount: number;
        errors: string[];
      }>(response, "Failed to run SLA notifications");
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        toast.warning(
          `Notifications processed ${result.processedCount}; errors: ${result.errors.length}`,
        );
      } else {
        toast.success(
          `Notifications sent. Processed ${result.processedCount}, email ${result.emailedCount}, webhook ${result.webhookCount}`,
        );
      }
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to run SLA notifications");
    } finally {
      setNotifying(false);
    }
  };

  const updateActionDraft = <K extends keyof BreachActionDraft>(
    breachId: number,
    key: K,
    value: BreachActionDraft[K],
  ) => {
    setActionDrafts((current) => {
      const existing = current[breachId] ?? {
        ownerUserId: "",
        dueDate: "",
        actionStatus: "OPEN" as const,
        resolutionNote: "",
        acknowledgeAlert: false,
        disputeStatus: "NONE" as const,
        disputeReason: "",
        disputeResolutionNote: "",
      };
      return {
        ...current,
        [breachId]: {
          ...existing,
          [key]: value,
        },
      };
    });
  };

  const submitBreachAction = async (breachId: number) => {
    if (!canManage) return;
    const draft = actionDrafts[breachId];
    if (!draft) return;

    try {
      setActionSavingId(breachId);
      const response = await fetch("/api/scm/sla/breaches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          breachId,
          ownerUserId: draft.ownerUserId || null,
          dueDate: draft.dueDate || null,
          actionStatus: draft.actionStatus,
          resolutionNote: draft.resolutionNote || null,
          acknowledgeAlert: draft.acknowledgeAlert,
          disputeStatus: draft.disputeStatus,
          disputeReason: draft.disputeReason || null,
          disputeResolutionNote: draft.disputeResolutionNote || null,
        }),
      });
      await readJson(response, "Failed to update SLA action workflow");
      toast.success("SLA action workflow updated");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update SLA action workflow");
    } finally {
      setActionSavingId(null);
    }
  };

  const updateTerminationDraft = <K extends keyof TerminationDraft>(
    caseId: number,
    key: K,
    value: TerminationDraft[K],
  ) => {
    setTerminationDrafts((current) => {
      const existing = current[caseId] ?? {
        ownerUserId: "",
        status: "OPEN" as const,
        recommendedAction: "REVIEW_CONTRACT" as const,
        resolutionNote: "",
        markReviewed: false,
      };
      return {
        ...current,
        [caseId]: {
          ...existing,
          [key]: value,
        },
      };
    });
  };

  const submitTerminationCase = async (caseId: number) => {
    if (!canManage) return;
    const draft = terminationDrafts[caseId];
    if (!draft) return;

    try {
      setTerminationSavingId(caseId);
      const response = await fetch("/api/scm/sla/termination-cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          ownerUserId: draft.ownerUserId || null,
          status: draft.status,
          recommendedAction: draft.recommendedAction,
          resolutionNote: draft.resolutionNote || null,
          markReviewed: draft.markReviewed,
        }),
      });
      await readJson(response, "Failed to update termination case");
      toast.success("Termination case workflow updated");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update termination case");
    } finally {
      setTerminationSavingId(null);
    }
  };

  const populateForm = (policy: SlaPolicy) => {
    setEditingPolicyId(policy.id);
    setForm({
      supplierId: String(policy.supplierId),
      isActive: policy.isActive,
      effectiveFrom: policy.effectiveFrom ? policy.effectiveFrom.slice(0, 10) : "",
      effectiveTo: policy.effectiveTo ? policy.effectiveTo.slice(0, 10) : "",
      evaluationWindowDays: String(policy.evaluationWindowDays),
      minTrackedPoCount: String(policy.minTrackedPoCount),
      targetLeadTimeDays: String(policy.targetLeadTimeDays),
      minimumOnTimeRate: String(policy.minimumOnTimeRate),
      minimumFillRate: String(policy.minimumFillRate),
      maxOpenLatePoCount: String(policy.maxOpenLatePoCount),
      autoEvaluationEnabled: policy.autoEvaluationEnabled,
      warningActionDueDays: String(policy.warningActionDueDays),
      breachActionDueDays: String(policy.breachActionDueDays),
      terminationClauseEnabled: policy.terminationClauseEnabled ?? false,
      terminationLookbackDays: String(policy.terminationLookbackDays ?? 180),
      terminationMinBreachCount: String(policy.terminationMinBreachCount ?? 3),
      terminationMinCriticalCount: String(policy.terminationMinCriticalCount ?? 1),
      terminationRecommendedAction: policy.terminationRecommendedAction ?? "REVIEW_CONTRACT",
      terminationNote: policy.terminationNote || "",
      financialRuleActive: policy.financialRule?.isActive ?? true,
      holdPaymentsOnThreeWayVariance:
        policy.financialRule?.holdPaymentsOnThreeWayVariance ?? true,
      holdPaymentsOnOpenSlaAction:
        policy.financialRule?.holdPaymentsOnOpenSlaAction ?? true,
      allowPaymentHoldOverride:
        policy.financialRule?.allowPaymentHoldOverride ?? true,
      autoCreditRecommendationEnabled:
        policy.financialRule?.autoCreditRecommendationEnabled ?? true,
      autoApplyRecommendedCredit:
        policy.financialRule?.autoApplyRecommendedCredit ?? false,
      autoApplyRequireMatchedInvoice:
        policy.financialRule?.autoApplyRequireMatchedInvoice ?? true,
      autoApplyBlockOnOpenDispute:
        policy.financialRule?.autoApplyBlockOnOpenDispute ?? true,
      warningPenaltyRatePercent: String(
        policy.financialRule?.warningPenaltyRatePercent ?? 0,
      ),
      breachPenaltyRatePercent: String(
        policy.financialRule?.breachPenaltyRatePercent ?? 2,
      ),
      criticalPenaltyRatePercent: String(
        policy.financialRule?.criticalPenaltyRatePercent ?? 5,
      ),
      minBreachCountForCredit: String(
        policy.financialRule?.minBreachCountForCredit ?? 1,
      ),
      autoApplyMaxAmount:
        policy.financialRule?.autoApplyMaxAmount === null ||
        policy.financialRule?.autoApplyMaxAmount === undefined
          ? ""
          : String(policy.financialRule.autoApplyMaxAmount),
      maxCreditCapAmount:
        policy.financialRule?.maxCreditCapAmount === null ||
        policy.financialRule?.maxCreditCapAmount === undefined
          ? ""
          : String(policy.financialRule.maxCreditCapAmount),
      financialRuleNote: policy.financialRule?.note || "",
      note: policy.note || "",
    });
  };

  if (!canRead) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
            <CardDescription>You do not have permission to access supplier SLA policies.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supplier SLA Policies</h1>
          <p className="text-sm text-muted-foreground">
            Define supplier SLA thresholds and keep breach logs for governance review.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="rounded-md border bg-background px-2 py-2 text-sm"
            value={analyticsDays}
            onChange={(event) => setAnalyticsDays(event.target.value)}
          >
            <option value="30">30d</option>
            <option value="60">60d</option>
            <option value="90">90d</option>
            <option value="180">180d</option>
            <option value="365">365d</option>
          </select>
          <Button variant="outline" onClick={() => void loadAnalytics()} disabled={analyticsLoading}>
            {analyticsLoading ? "Loading..." : "Refresh Analytics"}
          </Button>
          <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canManageNotifications ? (
            <Button variant="outline" onClick={() => void runNotifications()} disabled={notifying}>
              {notifying ? "Notifying..." : "Run Notifications"}
            </Button>
          ) : null}
          {canManage ? (
            <Button onClick={() => void runEvaluation()} disabled={running}>
              {running ? "Running..." : "Run Evaluation"}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SLA Analytics</CardTitle>
          <CardDescription>
            Phase-5 governance KPIs, trend, and supplier risk ranking ({analytics?.range.days || Number(analyticsDays) || 90} days).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!analytics ? (
            <p className="text-sm text-muted-foreground">
              {analyticsLoading ? "Loading analytics..." : "No analytics data available."}
            </p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Evaluations</p>
                  <p className="text-lg font-semibold">{analytics.summary.totalEvaluations}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Breaches</p>
                  <p className="text-lg font-semibold">{analytics.summary.breachCount}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Overdue Actions</p>
                  <p className="text-lg font-semibold">{analytics.summary.overdueActionCount}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Open Disputes</p>
                  <p className="text-lg font-semibold">{analytics.summary.openDisputeCount}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Termination Cases</p>
                  <p className="text-lg font-semibold">{analytics.summary.openTerminationCaseCount}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Applied Credit</p>
                  <p className="text-lg font-semibold">{analytics.summary.appliedCreditAmount}</p>
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Trend Snapshot</p>
                  <div className="space-y-1 text-xs">
                    {analytics.trends.slice(-7).map((row) => (
                      <div key={row.date} className="flex items-center justify-between gap-2">
                        <span>{row.date}</span>
                        <span className="text-muted-foreground">
                          OK {row.OK} | W {row.WARNING} | B {row.BREACH}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Top Risk Suppliers</p>
                  <div className="space-y-1 text-xs">
                    {analytics.topSuppliers.slice(0, 6).map((row) => (
                      <div key={row.supplierId} className="flex items-center justify-between gap-2">
                        <span>
                          {row.supplierName} ({row.supplierCode})
                        </span>
                        <span className="text-muted-foreground">
                          B {row.breachCount} | W {row.warningCount} | D {row.openDisputes}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{editingPolicyId ? "Edit SLA Policy" : "Create SLA Policy"}</CardTitle>
            <CardDescription>
              One active policy per supplier. Thresholds are evaluated against supplier intelligence metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.supplierId}
                  onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} ({supplier.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Evaluation Window (days)</Label>
                <Input
                  type="number"
                  min={7}
                  max={730}
                  value={form.evaluationWindowDays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, evaluationWindowDays: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Tracked POs</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.minTrackedPoCount}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minTrackedPoCount: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Target Lead Time (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={form.targetLeadTimeDays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, targetLeadTimeDays: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum On-Time Rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.minimumOnTimeRate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minimumOnTimeRate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Fill Rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.minimumFillRate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minimumFillRate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max Open Late POs</Label>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={form.maxOpenLatePoCount}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, maxOpenLatePoCount: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Warning Due (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={form.warningActionDueDays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, warningActionDueDays: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Breach Due (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={form.breachActionDueDays}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, breachActionDueDays: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Effective From</Label>
                <Input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, effectiveFrom: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input
                  type="date"
                  value={form.effectiveTo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, effectiveTo: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Policy Controls</Label>
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, isActive: event.target.checked }))
                      }
                    />
                    Active Policy
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.autoEvaluationEnabled}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          autoEvaluationEnabled: event.target.checked,
                        }))
                      }
                    />
                    Auto Daily Evaluation
                  </label>
                </div>
              </div>
              <div className="space-y-2 xl:col-span-2">
                <Label>Termination Clause</Label>
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.terminationClauseEnabled}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          terminationClauseEnabled: event.target.checked,
                        }))
                      }
                    />
                    Enable termination escalation
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Lookback Days</Label>
                      <Input
                        type="number"
                        min={30}
                        max={730}
                        value={form.terminationLookbackDays}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            terminationLookbackDays: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Min Breach Count</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={form.terminationMinBreachCount}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            terminationMinBreachCount: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Min Critical Count</Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={form.terminationMinCriticalCount}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            terminationMinCriticalCount: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Recommended Action</Label>
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={form.terminationRecommendedAction}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            terminationRecommendedAction:
                              event.target.value as SlaFormState["terminationRecommendedAction"],
                          }))
                        }
                      >
                        <option value="WATCHLIST">WATCHLIST</option>
                        <option value="SUSPEND_NEW_PO">SUSPEND_NEW_PO</option>
                        <option value="REVIEW_CONTRACT">REVIEW_CONTRACT</option>
                        <option value="TERMINATE_RELATIONSHIP">TERMINATE_RELATIONSHIP</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Termination Clause Note</Label>
              <Textarea
                rows={2}
                value={form.terminationNote}
                onChange={(event) =>
                  setForm((current) => ({ ...current, terminationNote: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                rows={3}
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              />
            </div>
            <div className="space-y-3 rounded-md border p-4">
              <div>
                <Label>AP Financial Controls</Label>
                <p className="text-xs text-muted-foreground">
                  Configure payment hold policy and SLA credit recommendation rates.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.financialRuleActive}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        financialRuleActive: event.target.checked,
                      }))
                    }
                  />
                  Financial Rule Active
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.holdPaymentsOnThreeWayVariance}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        holdPaymentsOnThreeWayVariance: event.target.checked,
                      }))
                    }
                  />
                  Hold on 3-way variance
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.holdPaymentsOnOpenSlaAction}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        holdPaymentsOnOpenSlaAction: event.target.checked,
                      }))
                    }
                  />
                  Hold on open SLA action
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowPaymentHoldOverride}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        allowPaymentHoldOverride: event.target.checked,
                      }))
                    }
                  />
                  Allow AP override
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.autoCreditRecommendationEnabled}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        autoCreditRecommendationEnabled: event.target.checked,
                      }))
                    }
                  />
                  Auto credit recommendation
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.autoApplyRecommendedCredit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        autoApplyRecommendedCredit: event.target.checked,
                      }))
                    }
                  />
                  Auto-apply credit to AP
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.autoApplyRequireMatchedInvoice}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        autoApplyRequireMatchedInvoice: event.target.checked,
                      }))
                    }
                  />
                  Require MATCHED invoice for auto-apply
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.autoApplyBlockOnOpenDispute}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        autoApplyBlockOnOpenDispute: event.target.checked,
                      }))
                    }
                  />
                  Block auto-apply on open dispute
                </label>
                <div className="space-y-1">
                  <Label>Warning Penalty %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.warningPenaltyRatePercent}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        warningPenaltyRatePercent: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Breach Penalty %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.breachPenaltyRatePercent}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        breachPenaltyRatePercent: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Critical Penalty %</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.criticalPenaltyRatePercent}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        criticalPenaltyRatePercent: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Min Breach Count</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.minBreachCountForCredit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        minBreachCountForCredit: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Max Credit Cap</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.maxCreditCapAmount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        maxCreditCapAmount: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Auto-Apply Max Amount</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.autoApplyMaxAmount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        autoApplyMaxAmount: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Financial Rule Note</Label>
                <Textarea
                  rows={2}
                  value={form.financialRuleNote}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, financialRuleNote: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void submitPolicy()} disabled={saving}>
                {saving ? "Saving..." : editingPolicyId ? "Update Policy" : "Create Policy"}
              </Button>
              {editingPolicyId ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingPolicyId(null);
                    setForm(DEFAULT_FORM);
                  }}
                >
                  Cancel Edit
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Policy Registry</CardTitle>
          <CardDescription>Configured SLA policy per supplier.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading SLA policies...</p>
          ) : policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SLA policies configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>On-Time %</TableHead>
                  <TableHead>Fill %</TableHead>
                  <TableHead>Late PO</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Auto Eval</TableHead>
                  <TableHead>Due SLA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <div className="font-medium">{policy.supplier.name}</div>
                      <div className="text-xs text-muted-foreground">{policy.supplier.code}</div>
                    </TableCell>
                    <TableCell>{policy.targetLeadTimeDays}d</TableCell>
                    <TableCell>{policy.minimumOnTimeRate}%</TableCell>
                    <TableCell>{policy.minimumFillRate}%</TableCell>
                    <TableCell>{policy.maxOpenLatePoCount}</TableCell>
                    <TableCell>{policy.evaluationWindowDays}d</TableCell>
                    <TableCell>
                      <Badge variant={policy.autoEvaluationEnabled ? "default" : "outline"}>
                        {policy.autoEvaluationEnabled ? "ON" : "OFF"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        Warning: {policy.warningActionDueDays}d
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Breach: {policy.breachActionDueDays}d
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={policy.isActive ? "default" : "outline"}>
                        {policy.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2">
                      {canManage ? (
                        <Button size="sm" variant="outline" onClick={() => populateForm(policy)}>
                          Edit
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button size="sm" onClick={() => void runEvaluation(policy.supplierId)} disabled={running}>
                          Evaluate
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Breach Log</CardTitle>
            <CardDescription>Latest evaluation results with issue trace for supplier governance.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Search supplier..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-56"
            />
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              <option value="OK">OK</option>
              <option value="WARNING">Warning</option>
              <option value="BREACH">Breach</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading breach logs...</p>
          ) : visibleBreaches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No SLA breach logs found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Evaluated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Breach Count</TableHead>
                  <TableHead>Observed LT</TableHead>
                  <TableHead>On-Time</TableHead>
                  <TableHead>Fill Rate</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Dispute</TableHead>
                  <TableHead>Termination</TableHead>
                  <TableHead>Issues</TableHead>
                  {canManage ? <TableHead>Workflow</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBreaches.map((row) => {
                  const issues = getIssues(row.issues);
                  const draft = actionDrafts[row.id] ?? toActionDraft(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.supplier.name}</div>
                        <div className="text-xs text-muted-foreground">{row.supplier.code}</div>
                      </TableCell>
                      <TableCell>{fmtDate(row.evaluationDate)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSeverityVariant(row.severity)}>{row.severity}</Badge>
                      </TableCell>
                      <TableCell>{row.breachCount}</TableCell>
                      <TableCell>{fmtValue(row.observedLeadTimeDays, "d")}</TableCell>
                      <TableCell>{fmtValue(row.onTimeRatePercent, "%")}</TableCell>
                      <TableCell>{fmtValue(row.fillRatePercent, "%")}</TableCell>
                      <TableCell>
                        <Badge variant={getActionVariant(row.actionStatus)}>{row.actionStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.owner ? (
                          <div>
                            <div className="text-xs font-medium">{row.owner.name || "Unnamed"}</div>
                            <div className="text-xs text-muted-foreground">{row.owner.email}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>{fmtDate(row.dueDate)}</TableCell>
                      <TableCell>
                        {row.alertTriggeredAt ? (
                          <div>
                            <div className="text-xs">{fmtDate(row.alertTriggeredAt)}</div>
                            <Badge variant={row.alertAcknowledgedAt ? "default" : "secondary"}>
                              {row.alertAcknowledgedAt ? "ACKNOWLEDGED" : "PENDING"}
                            </Badge>
                            {row.alertMessage ? (
                              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                                {row.alertMessage}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No alert</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant={row.disputeStatus === "NONE" ? "outline" : "secondary"}>
                            {row.disputeStatus}
                          </Badge>
                          {row.disputeReason ? (
                            <p className="max-w-xs text-xs text-muted-foreground">{row.disputeReason}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.terminationCase ? (
                          <div className="space-y-1">
                            <Badge variant="destructive">{row.terminationCase.status}</Badge>
                            <p className="text-xs text-muted-foreground">
                              {row.terminationCase.recommendedAction}
                            </p>
                          </div>
                        ) : row.terminationSuggestedAt ? (
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <p>Suggested: {fmtDate(row.terminationSuggestedAt)}</p>
                            {row.terminationSuggestionNote ? <p>{row.terminationSuggestionNote}</p> : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No escalation</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {issues.length === 0 ? (
                          <span className="text-muted-foreground">No issues</span>
                        ) : (
                          <div className="space-y-1 text-xs">
                            {issues.slice(0, 3).map((issue, index) => (
                              <p key={index}>{issue}</p>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      {canManage ? (
                        <TableCell className="space-y-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Owner</Label>
                            <select
                              className="w-44 rounded-md border bg-background px-2 py-1 text-xs"
                              value={draft.ownerUserId}
                              onChange={(event) =>
                                updateActionDraft(row.id, "ownerUserId", event.target.value)
                              }
                            >
                              <option value="">Unassigned</option>
                              {owners.map((owner) => (
                                <option key={owner.id} value={owner.id}>
                                  {(owner.name || owner.email).slice(0, 38)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Due Date</Label>
                            <Input
                              type="date"
                              className="h-8 w-44 text-xs"
                              value={draft.dueDate}
                              onChange={(event) =>
                                updateActionDraft(row.id, "dueDate", event.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Action Status</Label>
                            <select
                              className="w-44 rounded-md border bg-background px-2 py-1 text-xs"
                              value={draft.actionStatus}
                              onChange={(event) =>
                                updateActionDraft(
                                  row.id,
                                  "actionStatus",
                                  event.target.value as BreachActionDraft["actionStatus"],
                                )
                              }
                            >
                              <option value="NOT_REQUIRED">NOT_REQUIRED</option>
                              <option value="OPEN">OPEN</option>
                              <option value="IN_PROGRESS">IN_PROGRESS</option>
                              <option value="RESOLVED">RESOLVED</option>
                              <option value="DISMISSED">DISMISSED</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Resolution Note</Label>
                            <Textarea
                              rows={2}
                              className="w-44 text-xs"
                              value={draft.resolutionNote}
                              onChange={(event) =>
                                updateActionDraft(row.id, "resolutionNote", event.target.value)
                              }
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={draft.acknowledgeAlert}
                              onChange={(event) =>
                                updateActionDraft(row.id, "acknowledgeAlert", event.target.checked)
                              }
                            />
                            Acknowledge Alert
                          </label>
                          <div className="space-y-1">
                            <Label className="text-xs">Dispute Status</Label>
                            <select
                              className="w-44 rounded-md border bg-background px-2 py-1 text-xs"
                              value={draft.disputeStatus}
                              onChange={(event) =>
                                updateActionDraft(
                                  row.id,
                                  "disputeStatus",
                                  event.target.value as BreachActionDraft["disputeStatus"],
                                )
                              }
                            >
                              <option value="NONE">NONE</option>
                              <option value="OPEN">OPEN</option>
                              <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                              <option value="RESOLVED">RESOLVED</option>
                              <option value="REJECTED">REJECTED</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Dispute Reason</Label>
                            <Textarea
                              rows={2}
                              className="w-44 text-xs"
                              value={draft.disputeReason}
                              onChange={(event) =>
                                updateActionDraft(row.id, "disputeReason", event.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Dispute Resolution</Label>
                            <Textarea
                              rows={2}
                              className="w-44 text-xs"
                              value={draft.disputeResolutionNote}
                              onChange={(event) =>
                                updateActionDraft(
                                  row.id,
                                  "disputeResolutionNote",
                                  event.target.value,
                                )
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={actionSavingId === row.id}
                            onClick={() => void submitBreachAction(row.id)}
                          >
                            {actionSavingId === row.id ? "Saving..." : "Save Action"}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Termination Queue</CardTitle>
          <CardDescription>
            Auto-opened governance queue when policy termination clause thresholds are reached.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading termination cases...</p>
          ) : terminationCases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active termination escalation cases.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Updated</TableHead>
                  {canManage ? <TableHead>Workflow</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {terminationCases.map((row) => {
                  const draft = terminationDrafts[row.id] ?? toTerminationDraft(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>#{row.id}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.supplier.name}</div>
                        <div className="text-xs text-muted-foreground">{row.supplier.code}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "OPEN" ? "destructive" : "secondary"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.recommendedAction}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.openBreachCount} breaches / {row.criticalBreachCount} critical in {row.lookbackDays}d
                      </TableCell>
                      <TableCell>
                        <p className="max-w-sm text-xs text-muted-foreground">{row.reason}</p>
                      </TableCell>
                      <TableCell>
                        {row.owner ? (
                          <div className="text-xs">
                            <p>{row.owner.name || "Unnamed"}</p>
                            <p className="text-muted-foreground">{row.owner.email}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>{fmtDate(row.reviewedAt || row.resolvedAt || row.createdAt)}</TableCell>
                      {canManage ? (
                        <TableCell className="space-y-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Owner</Label>
                            <select
                              className="w-44 rounded-md border bg-background px-2 py-1 text-xs"
                              value={draft.ownerUserId}
                              onChange={(event) =>
                                updateTerminationDraft(row.id, "ownerUserId", event.target.value)
                              }
                            >
                              <option value="">Unassigned</option>
                              {owners.map((owner) => (
                                <option key={owner.id} value={owner.id}>
                                  {(owner.name || owner.email).slice(0, 38)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Case Status</Label>
                            <select
                              className="w-44 rounded-md border bg-background px-2 py-1 text-xs"
                              value={draft.status}
                              onChange={(event) =>
                                updateTerminationDraft(
                                  row.id,
                                  "status",
                                  event.target.value as TerminationDraft["status"],
                                )
                              }
                            >
                              <option value="OPEN">OPEN</option>
                              <option value="IN_REVIEW">IN_REVIEW</option>
                              <option value="APPROVED">APPROVED</option>
                              <option value="REJECTED">REJECTED</option>
                              <option value="EXECUTED">EXECUTED</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Recommended Action</Label>
                            <select
                              className="w-44 rounded-md border bg-background px-2 py-1 text-xs"
                              value={draft.recommendedAction}
                              onChange={(event) =>
                                updateTerminationDraft(
                                  row.id,
                                  "recommendedAction",
                                  event.target.value as TerminationDraft["recommendedAction"],
                                )
                              }
                            >
                              <option value="WATCHLIST">WATCHLIST</option>
                              <option value="SUSPEND_NEW_PO">SUSPEND_NEW_PO</option>
                              <option value="REVIEW_CONTRACT">REVIEW_CONTRACT</option>
                              <option value="TERMINATE_RELATIONSHIP">TERMINATE_RELATIONSHIP</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Resolution Note</Label>
                            <Textarea
                              rows={2}
                              className="w-44 text-xs"
                              value={draft.resolutionNote}
                              onChange={(event) =>
                                updateTerminationDraft(row.id, "resolutionNote", event.target.value)
                              }
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={draft.markReviewed}
                              onChange={(event) =>
                                updateTerminationDraft(row.id, "markReviewed", event.target.checked)
                              }
                            />
                            Mark reviewed
                          </label>
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={terminationSavingId === row.id}
                            onClick={() => void submitTerminationCase(row.id)}
                          >
                            {terminationSavingId === row.id ? "Saving..." : "Save Case"}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
