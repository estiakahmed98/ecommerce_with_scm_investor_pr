import { getAccessContext } from "@/lib/rbac";
import {
  getMissingSupplierDocumentTypes,
  getRequiredSupplierDocumentTypes,
  getSupplierDocumentLabel,
  isSupplierCompanyType,
  isSupplierDocumentType,
  type SupplierCompanyType,
  type SupplierDocumentType,
} from "@/lib/supplier-documents";

export type SupplierDocumentInput = {
  type: SupplierDocumentType;
  documentNumber: string | null;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  verificationStatus:
    | "PENDING"
    | "VERIFIED"
    | "REJECTED"
    | "EXPIRED";
  verifiedAt: Date | null;
  verificationNote: string | null;
};

export class SupplierValidationError extends Error {}

type SerializableSupplierDocument = SupplierDocumentInput & {
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type SerializableSupplier = {
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
  createdAt: Date | string;
  updatedAt: Date | string;
  documents: SerializableSupplierDocument[];
  categories?: Array<{
    supplierCategory: {
      id: number;
      code: string;
      name: string;
      isActive: boolean;
    };
  }>;
};

export function toCleanText(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toOptionalDate(value: unknown, fieldLabel: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new SupplierValidationError(`${fieldLabel} has an invalid date value.`);
  }
  return parsed;
}

export function normalizeSupplierCode(raw: unknown, fallbackName: string) {
  const source = toCleanText(raw, 40) || fallbackName;
  return source
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

export function normalizeSupplierCompanyType(
  raw: unknown,
  fallback?: SupplierCompanyType,
): SupplierCompanyType | null {
  if (isSupplierCompanyType(raw)) {
    return raw;
  }
  return fallback ?? null;
}

export function parseSupplierDocuments(raw: unknown): SupplierDocumentInput[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new SupplierValidationError("Documents must be provided as an array.");
  }

  const seenTypes = new Set<SupplierDocumentType>();

  return raw.map((item) => {
    const record =
      item && typeof item === "object" ? (item as Record<string, unknown>) : null;

    if (!record || !isSupplierDocumentType(record.type)) {
      throw new SupplierValidationError(
        "One or more supplier documents have an invalid type.",
      );
    }

    if (seenTypes.has(record.type)) {
      throw new SupplierValidationError(
        `Duplicate supplier document provided for ${getSupplierDocumentLabel(record.type)}.`,
      );
    }
    seenTypes.add(record.type);

    const fileUrl = toCleanText(record.fileUrl, 500);
    if (!fileUrl) {
      throw new SupplierValidationError(
        `${getSupplierDocumentLabel(record.type)} is missing an uploaded file.`,
      );
    }

    const fileSize =
      record.fileSize === null ||
      record.fileSize === undefined ||
      record.fileSize === ""
        ? null
        : Number(record.fileSize);

    if (
      fileSize !== null &&
      (!Number.isInteger(fileSize) || fileSize < 0)
    ) {
      throw new SupplierValidationError(
        `${getSupplierDocumentLabel(record.type)} has an invalid file size.`,
      );
    }

    return {
      type: record.type,
      documentNumber: toCleanText(record.documentNumber, 120) || null,
      fileUrl,
      fileName: toCleanText(record.fileName, 255) || null,
      mimeType: toCleanText(record.mimeType, 120) || null,
      fileSize,
      issuedAt: toOptionalDate(
        record.issuedAt,
        `${getSupplierDocumentLabel(record.type)} issued date`,
      ),
      expiresAt: toOptionalDate(
        record.expiresAt,
        `${getSupplierDocumentLabel(record.type)} expiry date`,
      ),
      verificationStatus:
        record.verificationStatus === "VERIFIED" ||
        record.verificationStatus === "REJECTED" ||
        record.verificationStatus === "EXPIRED"
          ? (record.verificationStatus as
              | "VERIFIED"
              | "REJECTED"
              | "EXPIRED")
          : "PENDING",
      verifiedAt: toOptionalDate(
        record.verifiedAt,
        `${getSupplierDocumentLabel(record.type)} verified date`,
      ),
      verificationNote: toCleanText(record.verificationNote, 500) || null,
    };
  });
}

export function parseSupplierCategoryIds(raw: unknown): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SupplierValidationError("Supplier categories must be an array.");
  }

  const uniqueIds = new Set<number>();
  for (const item of raw) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) {
      throw new SupplierValidationError("Supplier category ids must be positive integers.");
    }
    uniqueIds.add(id);
  }

  return [...uniqueIds];
}

export function assertRequiredSupplierDocuments(
  companyType: SupplierCompanyType,
  documents: SupplierDocumentInput[],
) {
  const missingTypes = getMissingSupplierDocumentTypes(companyType, documents);

  if (missingTypes.length > 0) {
    throw new SupplierValidationError(
      `Upload the required enlistment documents first: ${missingTypes
        .map(getSupplierDocumentLabel)
        .join(", ")}.`,
    );
  }
}

export function serializeSupplier<T extends SerializableSupplier>(supplier: T) {
  const requiredDocumentTypes = getRequiredSupplierDocumentTypes(supplier.companyType);
  const missingDocumentTypes = getMissingSupplierDocumentTypes(
    supplier.companyType,
    supplier.documents,
  );

  return {
    ...supplier,
    categories: (supplier.categories || []).map((membership) => ({
      id: membership.supplierCategory.id,
      code: membership.supplierCategory.code,
      name: membership.supplierCategory.name,
      isActive: membership.supplierCategory.isActive,
    })),
    requiredDocumentTypes,
    missingDocumentTypes,
    requiredDocumentCount: requiredDocumentTypes.length,
    uploadedRequiredDocumentCount:
      requiredDocumentTypes.length - missingDocumentTypes.length,
    documentsComplete: missingDocumentTypes.length === 0,
  };
}

export function toSupplierSnapshot(supplier: SerializableSupplier) {
  return {
    code: supplier.code,
    name: supplier.name,
    companyType: supplier.companyType,
    contactName: supplier.contactName,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    city: supplier.city,
    country: supplier.country,
    leadTimeDays: supplier.leadTimeDays,
    paymentTermsDays: supplier.paymentTermsDays,
    currency: supplier.currency,
    taxNumber: supplier.taxNumber,
    notes: supplier.notes,
    isActive: supplier.isActive,
    categories: (supplier.categories || []).map((membership) => ({
      id: membership.supplierCategory.id,
      code: membership.supplierCategory.code,
      name: membership.supplierCategory.name,
    })),
    documents: supplier.documents.map((document) => ({
      type: document.type,
      documentNumber: document.documentNumber,
      fileUrl: document.fileUrl,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      issuedAt:
        document.issuedAt instanceof Date
          ? document.issuedAt.toISOString()
          : document.issuedAt ?? null,
      expiresAt:
        document.expiresAt instanceof Date
          ? document.expiresAt.toISOString()
          : document.expiresAt ?? null,
      verificationStatus: document.verificationStatus,
      verifiedAt:
        document.verifiedAt instanceof Date
          ? document.verifiedAt.toISOString()
          : document.verifiedAt ?? null,
      verificationNote: document.verificationNote,
    })),
  };
}

export function hasSupplierReadAccess(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasGlobal("suppliers.read") || access.hasGlobal("suppliers.manage");
}

export function hasSupplierManageAccess(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasGlobal("suppliers.manage");
}
