import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { deriveInvestorKycStatusFromDocuments } from "@/lib/investor-documents";

export function serializeInvestorDocument(document: {
  id: number;
  investorId: number;
  type: string;
  fileUrl: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  documentNumber: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  status: string;
  reviewNote: string | null;
  uploadedById: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy?: { id: string; name: string | null; email: string } | null;
  reviewedBy?: { id: string; name: string | null; email: string } | null;
}) {
  const expiresAtIso = document.expiresAt?.toISOString() ?? null;
  const expiryTime = document.expiresAt?.getTime() ?? null;
  const isExpired = expiryTime !== null && expiryTime < Date.now();

  return {
    ...document,
    issuedAt: document.issuedAt?.toISOString() ?? null,
    expiresAt: expiresAtIso,
    reviewedAt: document.reviewedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    isExpired,
  };
}

export async function syncInvestorKycStatus(
  tx: Prisma.TransactionClient,
  investorId: number,
) {
  const documents = await tx.investorDocument.findMany({
    where: { investorId },
    select: {
      type: true,
      fileUrl: true,
      status: true,
      expiresAt: true,
    },
  });

  const next = deriveInvestorKycStatusFromDocuments(documents);
  await tx.investor.update({
    where: { id: investorId },
    data: {
      kycStatus: next.kycStatus,
      kycVerifiedAt: next.verifiedAt,
    },
  });
}

export async function getInvestorDocumentReadSummary(investorId: number) {
  const [investor, documents] = await Promise.all([
    prisma.investor.findUnique({
      where: { id: investorId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        kycStatus: true,
        kycVerifiedAt: true,
      },
    }),
    prisma.investorDocument.findMany({
      where: { investorId },
      orderBy: [{ type: "asc" }],
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    investor: investor
      ? {
          ...investor,
          kycVerifiedAt: investor.kycVerifiedAt?.toISOString() ?? null,
        }
      : null,
    documents: documents.map((document) => serializeInvestorDocument(document)),
  };
}
