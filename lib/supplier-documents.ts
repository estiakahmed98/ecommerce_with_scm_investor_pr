export const SUPPLIER_COMPANY_TYPES = ["PROPRIETOR", "LIMITED_COMPANY"] as const;

export type SupplierCompanyType = (typeof SUPPLIER_COMPANY_TYPES)[number];

export const SUPPLIER_DOCUMENT_TYPES = [
  "PROPRIETOR_NID",
  "TRADE_LICENSE",
  "PROPRIETOR_DETAILS",
  "PROPRIETOR_VISITING_CARD",
  "DECLARATION",
  "SEAL",
  "SIGNATURE",
  "DIRECTORS_NID_DETAILS",
  "CERTIFICATE_OF_INCORPORATION",
  "TAX_IDENTIFICATION_NUMBER",
  "BOARD_RESOLUTION",
  "VAT_REGISTRATION",
  "TAX_COMPLIANCE_CERTIFICATE",
  "BANK_INFORMATION",
] as const;

export type SupplierDocumentType = (typeof SUPPLIER_DOCUMENT_TYPES)[number];

export const SUPPLIER_COMPANY_TYPE_META: Record<
  SupplierCompanyType,
  {
    label: string;
    shortLabel: string;
    description: string;
  }
> = {
  PROPRIETOR: {
    label: "Proprietorship",
    shortLabel: "Proprietor",
    description: "Single-owner vendors with personal compliance documents.",
  },
  LIMITED_COMPANY: {
    label: "Limited Company",
    shortLabel: "Limited",
    description: "Registered companies with incorporation, tax, and board approvals.",
  },
};

export const SUPPLIER_DOCUMENT_LABELS: Record<SupplierDocumentType, string> = {
  PROPRIETOR_NID: "Proprietor NID",
  TRADE_LICENSE: "Trade License",
  PROPRIETOR_DETAILS: "Proprietor Details",
  PROPRIETOR_VISITING_CARD: "Proprietor Visiting Card",
  DECLARATION: "Declaration",
  SEAL: "Seal",
  SIGNATURE: "Sign",
  DIRECTORS_NID_DETAILS: "Directors NID / Details",
  CERTIFICATE_OF_INCORPORATION: "Certificate of Incorporation",
  TAX_IDENTIFICATION_NUMBER: "Tax Identification Number (TIN)",
  BOARD_RESOLUTION: "Board Resolution",
  VAT_REGISTRATION: "VAT Registration (BIN Certificate)",
  TAX_COMPLIANCE_CERTIFICATE: "Tax Compliance Certificate",
  BANK_INFORMATION: "Bank Information",
};

export const SUPPLIER_REQUIRED_DOCUMENTS: Record<
  SupplierCompanyType,
  SupplierDocumentType[]
> = {
  PROPRIETOR: [
    "PROPRIETOR_NID",
    "TRADE_LICENSE",
    "PROPRIETOR_DETAILS",
    "PROPRIETOR_VISITING_CARD",
    "TAX_IDENTIFICATION_NUMBER",
    "VAT_REGISTRATION",
    "TAX_COMPLIANCE_CERTIFICATE",
    "BANK_INFORMATION",
    "DECLARATION",
    "SEAL",
    "SIGNATURE",
  ],
  LIMITED_COMPANY: [
    "DIRECTORS_NID_DETAILS",
    "TRADE_LICENSE",
    "CERTIFICATE_OF_INCORPORATION",
    "TAX_IDENTIFICATION_NUMBER",
    "BOARD_RESOLUTION",
    "VAT_REGISTRATION",
    "TAX_COMPLIANCE_CERTIFICATE",
    "BANK_INFORMATION",
    "DECLARATION",
    "SEAL",
    "SIGNATURE",
  ],
};

export const SUPPLIER_DOCUMENT_SECTIONS: Record<
  SupplierCompanyType,
  Array<{
    title: string;
    description: string;
    types: SupplierDocumentType[];
  }>
> = {
  PROPRIETOR: [
    {
      title: "Identity & Licensing",
      description: "Core identity proof and legal trade registration.",
      types: ["PROPRIETOR_NID", "TRADE_LICENSE"],
    },
    {
      title: "Business Profile",
      description: "Owner profile and frontline contact materials.",
      types: ["PROPRIETOR_DETAILS", "PROPRIETOR_VISITING_CARD"],
    },
    {
      title: "Authorization",
      description: "Signed compliance artifacts required before enlistment.",
      types: ["DECLARATION", "SEAL", "SIGNATURE"],
    },
    {
      title: "Tax & Banking",
      description: "Fiscal compliance and payout settlement prerequisites.",
      types: [
        "TAX_IDENTIFICATION_NUMBER",
        "VAT_REGISTRATION",
        "TAX_COMPLIANCE_CERTIFICATE",
        "BANK_INFORMATION",
      ],
    },
  ],
  LIMITED_COMPANY: [
    {
      title: "Corporate Identity",
      description: "Director identification and incorporation proof.",
      types: [
        "DIRECTORS_NID_DETAILS",
        "TRADE_LICENSE",
        "CERTIFICATE_OF_INCORPORATION",
      ],
    },
    {
      title: "Tax & Registration",
      description: "Fiscal registrations required for vendor approval.",
      types: [
        "TAX_IDENTIFICATION_NUMBER",
        "VAT_REGISTRATION",
        "BOARD_RESOLUTION",
      ],
    },
    {
      title: "Authorization",
      description: "Signed compliance artifacts required before enlistment.",
      types: ["DECLARATION", "SEAL", "SIGNATURE"],
    },
    {
      title: "Banking",
      description: "Verified bank details for award and payment execution.",
      types: ["BANK_INFORMATION"],
    },
  ],
};

const companyTypeSet = new Set<string>(SUPPLIER_COMPANY_TYPES);
const documentTypeSet = new Set<string>(SUPPLIER_DOCUMENT_TYPES);

export function isSupplierCompanyType(value: unknown): value is SupplierCompanyType {
  return typeof value === "string" && companyTypeSet.has(value);
}

export function isSupplierDocumentType(value: unknown): value is SupplierDocumentType {
  return typeof value === "string" && documentTypeSet.has(value);
}

export function getRequiredSupplierDocumentTypes(
  companyType: SupplierCompanyType,
): SupplierDocumentType[] {
  return [...SUPPLIER_REQUIRED_DOCUMENTS[companyType]];
}

export function getSupplierDocumentLabel(type: SupplierDocumentType): string {
  return SUPPLIER_DOCUMENT_LABELS[type];
}

export function getMissingSupplierDocumentTypes(
  companyType: SupplierCompanyType,
  documents: Array<{ type: string; fileUrl?: string | null }>,
): SupplierDocumentType[] {
  const presentTypes = new Set<SupplierDocumentType>();

  for (const document of documents) {
    if (
      isSupplierDocumentType(document.type) &&
      typeof document.fileUrl === "string" &&
      document.fileUrl.trim()
    ) {
      presentTypes.add(document.type);
    }
  }

  return getRequiredSupplierDocumentTypes(companyType).filter(
    (type) => !presentTypes.has(type),
  );
}
