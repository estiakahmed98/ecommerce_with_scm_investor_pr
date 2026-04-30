"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  FileCheck2,
  FileText,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  SUPPLIER_COMPANY_TYPE_META,
  SUPPLIER_COMPANY_TYPES,
  SUPPLIER_DOCUMENT_SECTIONS,
  getMissingSupplierDocumentTypes,
  getRequiredSupplierDocumentTypes,
  getSupplierDocumentLabel,
  type SupplierCompanyType,
  type SupplierDocumentType,
} from "@/lib/supplier-documents";
import { uploadFile } from "@/lib/upload-file";

type SupplierDocument = {
  type: SupplierDocumentType;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
};

type SupplierCategory = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  supplierCount?: number;
};

type Supplier = {
  id: number;
  code: string;
  name: string;
  companyType: SupplierCompanyType;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  leadTimeDays: number | null;
  paymentTermsDays: number | null;
  currency: string;
  taxNumber: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  documents: SupplierDocument[];
  documentsComplete: boolean;
  requiredDocumentTypes: SupplierDocumentType[];
  missingDocumentTypes: SupplierDocumentType[];
  requiredDocumentCount: number;
  uploadedRequiredDocumentCount: number;
  categories: Array<{
    id: number;
    code: string;
    name: string;
    isActive: boolean;
  }>;
};

type SupplierDocumentDraft = {
  type: SupplierDocumentType;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  file: File | null;
  removed: boolean;
};

type SupplierFormState = {
  code: string;
  name: string;
  companyType: SupplierCompanyType;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  leadTimeDays: string;
  paymentTermsDays: string;
  currency: string;
  taxNumber: string;
  notes: string;
  isActive: boolean;
  categoryIds: string[];
  documents: SupplierDocumentDraft[];
};

type SupplierDocumentPayload = {
  type: SupplierDocumentType;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

type DocumentUploadCardProps = {
  type: SupplierDocumentType;
  draft?: SupplierDocumentDraft;
  disabled: boolean;
  onFileChange: (type: SupplierDocumentType, file: File | null) => void;
  onRemove: (type: SupplierDocumentType) => void;
};

const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function createEmptyForm(): SupplierFormState {
  return {
    code: "",
    name: "",
    companyType: "PROPRIETOR",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "BD",
    leadTimeDays: "",
    paymentTermsDays: "",
    currency: "BDT",
    taxNumber: "",
    notes: "",
    isActive: true,
    categoryIds: [],
    documents: [],
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed");
  }
  return data as T;
}

function formatBytes(size: number | null | undefined) {
  if (!size || size <= 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toDraftDocuments(documents: SupplierDocument[]): SupplierDocumentDraft[] {
  return documents.map((document) => ({
    type: document.type,
    fileUrl: document.fileUrl,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    file: null,
    removed: false,
  }));
}

function getDocumentDraft(
  documents: SupplierDocumentDraft[],
  type: SupplierDocumentType,
) {
  return documents.find((document) => document.type === type);
}

function upsertDocumentDraft(
  documents: SupplierDocumentDraft[],
  nextDocument: SupplierDocumentDraft,
) {
  const nextDocuments = [...documents];
  const index = nextDocuments.findIndex(
    (document) => document.type === nextDocument.type,
  );

  if (index === -1) nextDocuments.push(nextDocument);
  else nextDocuments[index] = nextDocument;

  return nextDocuments;
}

function deleteLocalUpload(fileUrl: string) {
  if (!fileUrl.startsWith("/upload/")) return Promise.resolve();

  return fetch(
    `/api/delete-file?path=${encodeURIComponent(fileUrl.replace(/^\//, ""))}`,
    { method: "DELETE" },
  ).catch(() => undefined);
}

function DocumentUploadCard({
  type,
  draft,
  disabled,
  onFileChange,
  onRemove,
}: DocumentUploadCardProps) {
  const label = getSupplierDocumentLabel(type);
  const hasSavedFile = Boolean(draft?.fileUrl && !draft.removed);
  const hasPendingFile = Boolean(draft?.file);
  const isMarkedForRemoval = Boolean(draft?.removed);

  let statusLabel = "Required";
  let statusClasses = "border-muted bg-muted text-muted-foreground";

  if (hasSavedFile) {
    statusLabel = "Uploaded";
    statusClasses = "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (hasPendingFile) {
    statusLabel = hasSavedFile ? "Replace on Save" : "Ready to Upload";
    statusClasses = "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (isMarkedForRemoval) {
    statusLabel = "Removed";
    statusClasses = "border-rose-200 bg-rose-50 text-rose-700";
  }

  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="font-medium text-foreground">{label}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Upload PDF or image copy. Max size 10 MB.
          </p>
        </div>
        <Badge variant="outline" className={statusClasses}>
          {statusLabel}
        </Badge>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        {hasSavedFile ? (
          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="font-medium text-foreground">
              {draft?.fileName || "Current document uploaded"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {draft?.mimeType ? <span>{draft.mimeType}</span> : null}
              {formatBytes(draft?.fileSize) ? (
                <span>{formatBytes(draft?.fileSize)}</span>
              ) : null}
            </div>
            <div className="mt-2">
              <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                <a href={draft?.fileUrl} target="_blank" rel="noreferrer">
                  View current file
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        ) : null}

        {hasPendingFile ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <p className="font-medium">{draft?.file?.name}</p>
            <p className="mt-1 text-xs">
              This file will be uploaded when you save the supplier.
            </p>
          </div>
        ) : null}

        {isMarkedForRemoval ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700">
            <p className="font-medium">Document removed from this supplier draft.</p>
            <p className="mt-1 text-xs">
              Upload a replacement before saving, otherwise enlistment will stay incomplete.
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Upload / Replace
          </Label>
          <div className="relative">
            <Input
              type="file"
              accept={FILE_ACCEPT}
              disabled={disabled}
              className="cursor-pointer pl-10"
              onChange={(event) =>
                onFileChange(type, event.target.files?.[0] ?? null)
              }
            />
            <Upload className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {(hasSavedFile || hasPendingFile || isMarkedForRemoval) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onRemove(type)}
          >
            <X className="h-4 w-4" />
            Clear document
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  const { data: session } = useSession();
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canManage = globalPermissions.includes("suppliers.manage");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierCategories, setSupplierCategories] = useState<SupplierCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierFormState>(createEmptyForm);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const [data, categories] = await Promise.all([
        getJson<Supplier[]>(
          `/api/scm/suppliers${params.size ? `?${params.toString()}` : ""}`,
        ),
        getJson<SupplierCategory[]>("/api/scm/supplier-categories?active=true"),
      ]);
      setSuppliers(Array.isArray(data) ? data : []);
      setSupplierCategories(Array.isArray(categories) ? categories : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load suppliers");
      setSuppliers([]);
      setSupplierCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.code,
        supplier.contactName,
        supplier.email,
        supplier.phone,
        SUPPLIER_COMPANY_TYPE_META[supplier.companyType].label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, suppliers]);

  const requiredDocumentTypes = useMemo(
    () => getRequiredSupplierDocumentTypes(form.companyType),
    [form.companyType],
  );

  const documentSections = useMemo(
    () => SUPPLIER_DOCUMENT_SECTIONS[form.companyType],
    [form.companyType],
  );

  const documentSummary = useMemo(() => {
    const currentDocuments = requiredDocumentTypes.map((type) => {
      const draft = getDocumentDraft(form.documents, type);

      return {
        type,
        fileUrl:
          draft && !draft.removed
            ? draft.file
              ? "__pending__"
              : draft.fileUrl
            : "",
      };
    });

    const missing = getMissingSupplierDocumentTypes(
      form.companyType,
      currentDocuments,
    );
    const uploaded = requiredDocumentTypes.length - missing.length;
    const progress = requiredDocumentTypes.length
      ? Math.round((uploaded / requiredDocumentTypes.length) * 100)
      : 0;

    return {
      missing,
      uploaded,
      progress,
      complete: missing.length === 0,
    };
  }, [form.companyType, form.documents, requiredDocumentTypes]);

  const resetForm = () => {
    setEditingId(null);
    setForm(createEmptyForm());
  };

  const populateForm = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({
      code: supplier.code,
      name: supplier.name,
      companyType: supplier.companyType,
      contactName: supplier.contactName || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      city: supplier.city || "",
      country: supplier.country || "BD",
      leadTimeDays: supplier.leadTimeDays?.toString() || "",
      paymentTermsDays: supplier.paymentTermsDays?.toString() || "",
      currency: supplier.currency || "BDT",
      taxNumber: supplier.taxNumber || "",
      notes: supplier.notes || "",
      isActive: supplier.isActive,
      categoryIds: supplier.categories.map((category) => String(category.id)),
      documents: toDraftDocuments(supplier.documents),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDocumentFileChange = (
    type: SupplierDocumentType,
    file: File | null,
  ) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("Each supplier document must be 10 MB or smaller.");
      return;
    }

    setForm((prev) => {
      const current = getDocumentDraft(prev.documents, type);

      return {
        ...prev,
        documents: upsertDocumentDraft(prev.documents, {
          type,
          fileUrl: current?.fileUrl || "",
          fileName: current?.fileName || null,
          mimeType: current?.mimeType || null,
          fileSize: current?.fileSize ?? null,
          file,
          removed: false,
        }),
      };
    });
  };

  const handleDocumentRemove = (type: SupplierDocumentType) => {
    setForm((prev) => {
      const current = getDocumentDraft(prev.documents, type);
      if (!current) return prev;

      if (!current.fileUrl) {
        return {
          ...prev,
          documents: prev.documents.filter((document) => document.type !== type),
        };
      }

      return {
        ...prev,
        documents: upsertDocumentDraft(prev.documents, {
          ...current,
          file: null,
          removed: true,
        }),
      };
    });
  };

  const toggleCategorySelection = (categoryId: number) => {
    setForm((prev) => {
      const idAsString = String(categoryId);
      const has = prev.categoryIds.includes(idAsString);
      return {
        ...prev,
        categoryIds: has
          ? prev.categoryIds.filter((item) => item !== idAsString)
          : [...prev.categoryIds, idAsString],
      };
    });
  };

  const createSupplierCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("Category name is required.");
      return;
    }

    try {
      setCreatingCategory(true);
      const response = await fetch("/api/scm/supplier-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: newCategoryCode.trim(),
          description: newCategoryDescription.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create supplier category.");
      }

      const created = payload as SupplierCategory;
      setSupplierCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({
        ...prev,
        categoryIds: prev.categoryIds.includes(String(created.id))
          ? prev.categoryIds
          : [...prev.categoryIds, String(created.id)],
      }));
      setNewCategoryName("");
      setNewCategoryCode("");
      setNewCategoryDescription("");
      toast.success("Supplier category created.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to create supplier category.");
    } finally {
      setCreatingCategory(false);
    }
  };

  const saveSupplier = async () => {
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    if (documentSummary.missing.length > 0) {
      toast.error(
        `Upload required documents first: ${documentSummary.missing
          .map(getSupplierDocumentLabel)
          .join(", ")}`,
      );
      return;
    }

    const uploadedDocuments: SupplierDocumentPayload[] = [];

    try {
      setSaving(true);

      for (const type of requiredDocumentTypes) {
        const draft = getDocumentDraft(form.documents, type);
        if (!draft || draft.removed || !draft.file) continue;

        const fileUrl = await uploadFile(draft.file);
        uploadedDocuments.push({
          type,
          fileUrl,
          fileName: draft.file.name,
          mimeType: draft.file.type || null,
          fileSize: draft.file.size,
        });
      }

      const uploadedMap = new Map(
        uploadedDocuments.map((document) => [document.type, document]),
      );
      const requiredTypeSet = new Set(requiredDocumentTypes);

      const documentsPayload = requiredDocumentTypes.flatMap((type) => {
        const draft = getDocumentDraft(form.documents, type);
        if (!draft || draft.removed) return [];

        const uploaded = uploadedMap.get(type);
        if (uploaded) return [uploaded];
        if (!draft.fileUrl) return [];

        return [
          {
            type,
            fileUrl: draft.fileUrl,
            fileName: draft.fileName,
            mimeType: draft.mimeType,
            fileSize: draft.fileSize ?? null,
          },
        ];
      });

      const cleanupAfterSuccess = Array.from(
        new Set(
          form.documents
            .filter(
              (document) =>
                document.fileUrl &&
                (document.removed ||
                  uploadedMap.has(document.type) ||
                  !requiredTypeSet.has(document.type)),
            )
            .map((document) => document.fileUrl),
        ),
      );

      const url = editingId
        ? `/api/scm/suppliers/${editingId}`
        : "/api/scm/suppliers";
      const method = editingId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          companyType: form.companyType,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone,
          address: form.address,
          city: form.city,
          country: form.country,
          leadTimeDays: form.leadTimeDays || null,
          paymentTermsDays: form.paymentTermsDays || null,
          currency: form.currency,
          taxNumber: form.taxNumber,
          notes: form.notes,
          isActive: form.isActive,
          categoryIds: form.categoryIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
          documents: documentsPayload,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Save failed");
      }

      await Promise.allSettled(
        cleanupAfterSuccess.map((fileUrl) => deleteLocalUpload(fileUrl)),
      );

      toast.success(editingId ? "Supplier updated" : "Supplier created");
      resetForm();
      await loadSuppliers();
    } catch (error: any) {
      await Promise.allSettled(
        uploadedDocuments.map((document) => deleteLocalUpload(document.fileUrl)),
      );
      toast.error(error?.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const companyMeta = SUPPLIER_COMPANY_TYPE_META[form.companyType];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            Maintain supplier master data and collect the mandatory enlistment
            documents before onboarding a vendor.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search suppliers..."
            className="w-full md:w-72"
          />
          <Button variant="outline" onClick={() => void loadSuppliers()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {canManage ? (
        <div className="space-y-4">
          <Card className="overflow-hidden border-border">
            <div className="grid gap-6 bg-card p-6 lg:grid-cols-[1.6fr_1fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-amber-200 bg-card text-amber-700">
                    <Building2 className="h-3.5 w-3.5" />
                    {companyMeta.label}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-card text-emerald-700"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {requiredDocumentTypes.length} required documents
                  </Badge>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">
                    {editingId ? "Update supplier onboarding dossier" : "Create supplier dossier"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    {companyMeta.description} Fill the supplier profile, upload every
                    mandatory file, then save the record for procurement use.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Enlistment readiness
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Required uploads completed
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold text-foreground">
                      {documentSummary.uploaded}/{requiredDocumentTypes.length}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {documentSummary.progress}% ready
                    </p>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
                    style={{ width: `${documentSummary.progress}%` }}
                  />
                </div>

                <div className="mt-4 flex items-start gap-2 text-sm">
                  {documentSummary.complete ? (
                    <>
                      <BadgeCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <p className="text-emerald-700">
                        All mandatory documents are attached for this company type.
                      </p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
                      <p className="text-foreground">
                        Missing:{" "}
                        {documentSummary.missing.map(getSupplierDocumentLabel).join(", ")}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{editingId ? "Edit Supplier" : "Create Supplier"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-border bg-muted/60 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">Company Profile</h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label>Supplier Name</Label>
                      <Input
                        value={form.name}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Acme Traders Ltd"
                      />
                    </div>
                    <div>
                      <Label>Supplier Code</Label>
                      <Input
                        value={form.code}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, code: event.target.value }))
                        }
                        placeholder="ACME"
                      />
                    </div>
                    <div>
                      <Label>Company Type</Label>
                      <Select
                        value={form.companyType}
                        onValueChange={(value) =>
                          setForm((prev) => ({
                            ...prev,
                            companyType: value as SupplierCompanyType,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select company type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPLIER_COMPANY_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {SUPPLIER_COMPANY_TYPE_META[type].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Contact Name</Label>
                      <Input
                        value={form.contactName}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, contactName: event.target.value }))
                        }
                        placeholder="Primary contact"
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        value={form.email}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        placeholder="supplier@example.com"
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={form.phone}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, phone: event.target.value }))
                        }
                        placeholder="+8801..."
                      />
                    </div>
                    <div>
                      <Label>Tax Number</Label>
                      <Input
                        value={form.taxNumber}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, taxNumber: event.target.value }))
                        }
                        placeholder="TIN / Tax reference"
                      />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                      <div>
                        <Label>Supplier Categories</Label>
                        <p className="text-xs text-muted-foreground">
                          RFQ category targeting uses these vendor categories.
                        </p>
                      </div>
                      {supplierCategories.length === 0 ? (
                        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                          No active supplier category found. Create one below.
                        </p>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2">
                          {supplierCategories.map((category) => {
                            const checked = form.categoryIds.includes(String(category.id));
                            return (
                              <label
                                key={category.id}
                                className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleCategorySelection(category.id)}
                                />
                                <span>
                                  <span className="font-medium">{category.name}</span>
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    ({category.code})
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_1.2fr_auto]">
                        <Input
                          placeholder="New category name"
                          value={newCategoryName}
                          onChange={(event) => setNewCategoryName(event.target.value)}
                        />
                        <Input
                          placeholder="Code (optional)"
                          value={newCategoryCode}
                          onChange={(event) => setNewCategoryCode(event.target.value)}
                        />
                        <Input
                          placeholder="Description (optional)"
                          value={newCategoryDescription}
                          onChange={(event) => setNewCategoryDescription(event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void createSupplierCategory()}
                          disabled={creatingCategory || !canManage}
                        >
                          {creatingCategory ? "Adding..." : "Add"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/60 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">Commercial Terms</h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Lead Time (Days)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.leadTimeDays}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, leadTimeDays: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Payment Terms (Days)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.paymentTermsDays}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            paymentTermsDays: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>City</Label>
                      <Input
                        value={form.city}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, city: event.target.value }))
                        }
                        placeholder="Dhaka"
                      />
                    </div>
                    <div>
                      <Label>Country</Label>
                      <Input
                        value={form.country}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, country: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Currency</Label>
                      <Input
                        value={form.currency}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            currency: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </div>
                    <div className="flex items-end rounded-xl border border-border bg-card px-4 py-3">
                      <div className="flex w-full items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Active Supplier
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Inactive suppliers stay out of operational lists.
                          </p>
                        </div>
                        <Switch
                          checked={form.isActive}
                          onCheckedChange={(checked) =>
                            setForm((prev) => ({ ...prev, isActive: Boolean(checked) }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                <div className="rounded-2xl border border-border p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground">Vendor Enlistment Documents</h3>
                  </div>

                  <div className="space-y-6">
                    {documentSections.map((section) => (
                      <div key={section.title} className="space-y-3">
                        <div>
                          <p className="font-medium text-foreground">{section.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {section.description}
                          </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          {section.types.map((type) => (
                            <DocumentUploadCard
                              key={type}
                              type={type}
                              draft={getDocumentDraft(form.documents, type)}
                              disabled={saving}
                              onFileChange={handleDocumentFileChange}
                              onRemove={handleDocumentRemove}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border p-5">
                    <Label>Address</Label>
                    <Textarea
                      value={form.address}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, address: event.target.value }))
                      }
                      rows={4}
                      placeholder="Office / warehouse address"
                    />
                  </div>
                  <div className="rounded-2xl border border-border p-5">
                    <Label>Internal Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      rows={8}
                      placeholder="Commercial notes, compliance remarks, sourcing context..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void saveSupplier()} disabled={saving}>
                  {saving ? "Saving..." : editingId ? "Update Supplier" : "Create Supplier"}
                </Button>
                <Button variant="outline" onClick={resetForm} disabled={saving}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Supplier Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading suppliers...</p>
          ) : filteredSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suppliers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Business Type</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Lead Time</TableHead>
                    <TableHead>Payment Terms</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{supplier.name}</div>
                        <div className="text-xs text-muted-foreground">{supplier.code}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {SUPPLIER_COMPANY_TYPE_META[supplier.companyType].shortLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {supplier.categories.length > 0 ? (
                            supplier.categories.map((category) => (
                              <Badge key={category.id} variant="outline" className="text-xs">
                                {category.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">Uncategorized</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{supplier.contactName || "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {[supplier.email, supplier.phone].filter(Boolean).join(" | ") || "-"}
                        </div>
                      </TableCell>
                      <TableCell>{supplier.leadTimeDays ?? "-"}</TableCell>
                      <TableCell>{supplier.paymentTermsDays ?? "-"}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className={
                              supplier.documentsComplete
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                            style={{
                              backgroundColor: supplier.documentsComplete 
                                ? 'hsl(142 76% 36% / 0.1)'
                                : 'hsl(38 92% 50% / 0.1)',
                              borderColor: supplier.documentsComplete
                                ? 'hsl(142 76% 36%)'
                                : 'hsl(38 92% 50%)',
                              color: supplier.documentsComplete
                                ? 'hsl(142 76% 36%)'
                                : 'hsl(38 92% 50%)'
                            }}
                          >
                            {supplier.documentsComplete
                              ? "Complete"
                              : `${supplier.uploadedRequiredDocumentCount}/${supplier.requiredDocumentCount} uploaded`}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {supplier.documentsComplete
                              ? "All required files submitted"
                              : `Missing: ${supplier.missingDocumentTypes
                                  .map(getSupplierDocumentLabel)
                                  .join(", ")}`}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{supplier.isActive ? "Active" : "Inactive"}</TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => populateForm(supplier)}
                          >
                            Edit
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
