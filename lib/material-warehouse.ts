import { Prisma } from "@/generated/prisma";

type TransactionClient = Prisma.TransactionClient;

function getYearMonthPrefix(prefix: string) {
  const today = new Date();
  return `${prefix}-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export async function generateMaterialRequestNumber(tx: TransactionClient) {
  const prefix = getYearMonthPrefix("MRQ");
  const count = await tx.materialRequest.count({
    where: {
      requestNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function generateMaterialReleaseNumber(tx: TransactionClient) {
  const prefix = getYearMonthPrefix("MRN");
  const count = await tx.materialReleaseNote.count({
    where: {
      releaseNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function generateMaterialChallanNumber(tx: TransactionClient) {
  const prefix = getYearMonthPrefix("CHL");
  const count = await tx.materialReleaseNote.count({
    where: {
      challanNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function generateMaterialWaybillNumber(tx: TransactionClient) {
  const prefix = getYearMonthPrefix("WBL");
  const count = await tx.materialReleaseNote.count({
    where: {
      waybillNumber: {
        startsWith: prefix,
      },
    },
  });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

export const materialRequestInclude = Prisma.validator<Prisma.MaterialRequestInclude>()({
  warehouse: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  supervisorEndorsedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  projectManagerEndorsedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  adminApprovedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  rejectedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  items: {
    include: {
      productVariant: {
        select: {
          id: true,
          sku: true,
          costPrice: true,
          product: {
            select: {
              id: true,
              name: true,
              inventoryItemClass: true,
              requiresAssetTag: true,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  },
  attachments: {
    orderBy: { createdAt: "desc" },
  },
  approvalEvents: {
    include: {
      actedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ actedAt: "asc" }, { id: "asc" }],
  },
  releaseNotes: {
    include: {
      releasedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          productVariant: {
            select: {
              id: true,
              sku: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
  },
});

export const materialReleaseInclude = Prisma.validator<Prisma.MaterialReleaseNoteInclude>()({
  warehouse: {
    select: {
      id: true,
      name: true,
      code: true,
    },
  },
  releasedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  materialRequest: {
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  items: {
    include: {
      materialRequestItem: {
        select: {
          id: true,
          quantityRequested: true,
          quantityReleased: true,
        },
      },
      productVariant: {
        select: {
          id: true,
          sku: true,
          product: {
            select: {
              id: true,
              name: true,
              inventoryItemClass: true,
              requiresAssetTag: true,
            },
          },
        },
      },
      assetRegisters: {
        select: {
          id: true,
          assetTag: true,
          status: true,
        },
      },
    },
    orderBy: { id: "asc" },
  },
  assetRegisters: {
    select: {
      id: true,
      assetTag: true,
      status: true,
      productVariantId: true,
    },
    orderBy: { id: "asc" },
  },
});

export type MaterialRequestWithRelations = Prisma.MaterialRequestGetPayload<{
  include: typeof materialRequestInclude;
}>;

export type MaterialReleaseWithRelations = Prisma.MaterialReleaseNoteGetPayload<{
  include: typeof materialReleaseInclude;
}>;

export function toMaterialRequestLogSnapshot(request: MaterialRequestWithRelations) {
  return {
    requestNumber: request.requestNumber,
    warehouseId: request.warehouseId,
    status: request.status,
    title: request.title ?? null,
    purpose: request.purpose ?? null,
    budgetCode: request.budgetCode ?? null,
    boqReference: request.boqReference ?? null,
    specification: request.specification ?? null,
    note: request.note ?? null,
    requiredBy: request.requiredBy?.toISOString() ?? null,
    submittedAt: request.submittedAt?.toISOString() ?? null,
    supervisorEndorsedAt: request.supervisorEndorsedAt?.toISOString() ?? null,
    projectManagerEndorsedAt: request.projectManagerEndorsedAt?.toISOString() ?? null,
    adminApprovedAt: request.adminApprovedAt?.toISOString() ?? null,
    rejectedAt: request.rejectedAt?.toISOString() ?? null,
    items: request.items.map((item) => ({
      id: item.id,
      productVariantId: item.productVariantId,
      sku: item.productVariant.sku,
      productName: item.productVariant.product.name,
      quantityRequested: item.quantityRequested,
      quantityReleased: item.quantityReleased,
      description: item.description ?? null,
    })),
  };
}

export function toMaterialReleaseLogSnapshot(release: MaterialReleaseWithRelations) {
  return {
    releaseNumber: release.releaseNumber,
    challanNumber: release.challanNumber ?? null,
    waybillNumber: release.waybillNumber ?? null,
    materialRequestId: release.materialRequestId,
    warehouseId: release.warehouseId,
    status: release.status,
    releasedAt: release.releasedAt.toISOString(),
    note: release.note ?? null,
    items: release.items.map((item) => ({
      id: item.id,
      materialRequestItemId: item.materialRequestItemId,
      productVariantId: item.productVariantId,
      sku: item.productVariant.sku,
      productName: item.productVariant.product.name,
      quantityReleased: item.quantityReleased,
      unitCost: item.unitCost?.toString() ?? null,
      assetTags: item.assetRegisters.map((asset) => asset.assetTag),
    })),
  };
}

export async function generateAssetTags(params: {
  tx: TransactionClient;
  warehouseCode: string;
  productSku: string;
  count: number;
}) {
  const { tx, warehouseCode, productSku, count } = params;
  if (!Number.isInteger(count) || count <= 0) return [];

  const currentYear = new Date().getFullYear();
  const prefix = `AST-${warehouseCode}-${String(productSku || "SKU").replace(/[^A-Za-z0-9]/g, "").slice(0, 20)}-${currentYear}`;

  const latest = await tx.assetRegister.findFirst({
    where: {
      assetTag: {
        startsWith: `${prefix}-`,
      },
    },
    orderBy: {
      id: "desc",
    },
    select: {
      assetTag: true,
    },
  });

  const latestSerial =
    latest?.assetTag &&
    /^\w[\w-]*-(\d{5})$/.exec(latest.assetTag)?.[1]
      ? Number(/(\d{5})$/.exec(latest.assetTag)?.[1] || "0")
      : 0;

  return Array.from({ length: count }, (_, index) => {
    const serial = String(latestSerial + index + 1).padStart(5, "0");
    return `${prefix}-${serial}`;
  });
}

