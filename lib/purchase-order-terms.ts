import { Prisma } from "@/generated/prisma";

type TransactionClient = Prisma.TransactionClient;

export type PurchaseOrderTermsTemplateSnapshot = {
  id: number;
  code: string;
  name: string;
  body: string;
};

const DEFAULT_PURCHASE_ORDER_TERMS_TEMPLATES = [
  {
    code: "STANDARD_SUPPLY",
    name: "Standard Supply Terms",
    body:
      "1) Supplier must deliver full ordered quantity within agreed timeline.\n" +
      "2) Goods must match approved specification/BOQ and quality standards.\n" +
      "3) Buyer reserves right to reject non-conforming materials.\n" +
      "4) Invoice must reference PO number and delivered quantities.\n" +
      "5) Payment terms follow approved contract and 3-way match compliance.\n" +
      "6) Applicable taxes, duties, and statutory compliance remain supplier responsibility unless explicitly stated.",
    isDefault: true,
  },
  {
    code: "PROJECT_PROCUREMENT",
    name: "Project Procurement Terms",
    body:
      "1) Delivery schedule shall align with project milestone plan.\n" +
      "2) Supplier must share pre-dispatch checklist and batch details.\n" +
      "3) Delay beyond committed lead time may trigger SLA penalty.\n" +
      "4) Buyer may request phased delivery and partial inspection.\n" +
      "5) Any variation in scope/spec must be pre-approved in writing.\n" +
      "6) Final payment is subject to acceptance and compliance documentation.",
    isDefault: false,
  },
] as const;

export async function ensureDefaultPurchaseOrderTermsTemplates(
  tx: TransactionClient,
  createdById?: string | null,
) {
  await tx.purchaseOrderTermsTemplate.createMany({
    data: DEFAULT_PURCHASE_ORDER_TERMS_TEMPLATES.map((template) => ({
      code: template.code,
      name: template.name,
      body: template.body,
      isDefault: template.isDefault,
      isActive: true,
      createdById: createdById ?? null,
      updatedById: createdById ?? null,
    })),
    skipDuplicates: true,
  });
}

export async function resolvePurchaseOrderTermsTemplate(
  tx: TransactionClient,
  params: {
    templateId?: number | null;
    createdById?: string | null;
  },
): Promise<PurchaseOrderTermsTemplateSnapshot | null> {
  await ensureDefaultPurchaseOrderTermsTemplates(tx, params.createdById ?? null);

  if (params.templateId && Number.isInteger(params.templateId) && params.templateId > 0) {
    const picked = await tx.purchaseOrderTermsTemplate.findFirst({
      where: { id: params.templateId, isActive: true },
      select: { id: true, code: true, name: true, body: true },
    });
    return picked ?? null;
  }

  const defaultTemplate = await tx.purchaseOrderTermsTemplate.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    select: { id: true, code: true, name: true, body: true },
  });
  return defaultTemplate ?? null;
}
