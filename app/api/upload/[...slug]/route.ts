import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { resolveSupplierPortalContext } from "@/lib/supplier-portal";
import { resolveInvestorPortalContext } from "@/lib/investor-portal";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rootUploadDir = path.join(process.cwd(), "public", "upload");
const SCM_PROPOSAL_PREFIX = "scm-proposals";
const SCM_GRN_PREFIX = "scm-grn";
const SCM_MATERIAL_PREFIX = "scm-material";
const INVESTOR_KYC_PREFIX = "investor-kyc";
const INVESTOR_PAYOUT_PROOF_PREFIX = "investor-payout-proof";

function guessContentType(ext: string) {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function isScmProposalPath(relPath: string) {
  return (
    relPath === SCM_PROPOSAL_PREFIX ||
    relPath.startsWith(`${SCM_PROPOSAL_PREFIX}/`)
  );
}

function isScmGrnPath(relPath: string) {
  return relPath === SCM_GRN_PREFIX || relPath.startsWith(`${SCM_GRN_PREFIX}/`);
}

function isScmMaterialPath(relPath: string) {
  return (
    relPath === SCM_MATERIAL_PREFIX ||
    relPath.startsWith(`${SCM_MATERIAL_PREFIX}/`)
  );
}

function isInvestorKycPath(relPath: string) {
  return relPath === INVESTOR_KYC_PREFIX || relPath.startsWith(`${INVESTOR_KYC_PREFIX}/`);
}

function isInvestorPayoutProofPath(relPath: string) {
  return (
    relPath === INVESTOR_PAYOUT_PROOF_PREFIX ||
    relPath.startsWith(`${INVESTOR_PAYOUT_PROOF_PREFIX}/`)
  );
}

async function canWriteScmProposalFiles(sessionUser: {
  id?: string;
  role?: string;
} | null | undefined) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  if (access.hasAny(["rfq.manage", "rfq.approve"])) {
    return true;
  }

  const supplier = await resolveSupplierPortalContext(sessionUser);
  return (
    supplier.ok &&
    supplier.context.access.has("supplier.rfq.quote.submit")
  );
}

async function canReadScmProposalFile(
  relPath: string,
  sessionUser: { id?: string; role?: string } | null | undefined,
) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  const fileUrl = `/api/upload/${relPath}`;
  const attachment = await prisma.supplierQuotationAttachment.findFirst({
    where: { fileUrl },
    select: {
      supplierQuotation: {
        select: {
          supplierId: true,
          rfq: {
            select: {
              warehouseId: true,
            },
          },
        },
      },
    },
  });

  if (!attachment) return false;

  const warehouseId = attachment.supplierQuotation.rfq.warehouseId;
  if (
    access.can("rfq.read", warehouseId) ||
    access.can("rfq.manage", warehouseId) ||
    access.can("rfq.approve", warehouseId)
  ) {
    return true;
  }

  const supplier = await resolveSupplierPortalContext(sessionUser);
  return (
    supplier.ok &&
    supplier.context.supplierId === attachment.supplierQuotation.supplierId &&
    supplier.context.access.hasAny([
      "supplier.rfq.read",
      "supplier.rfq.quote.submit",
    ])
  );
}

async function canWriteScmGrnFiles(sessionUser: {
  id?: string;
  role?: string;
} | null | undefined) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  return access.hasAny([
    "goods_receipts.read",
    "goods_receipts.manage",
    "purchase_orders.manage",
    "purchase_requisitions.manage",
    "supplier.feedback.manage",
  ]);
}

async function canWriteScmMaterialFiles(sessionUser: {
  id?: string;
  role?: string;
} | null | undefined) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  return access.hasAny([
    "material_requests.read",
    "material_requests.manage",
    "material_requests.endorse_supervisor",
    "material_requests.endorse_project_manager",
    "material_requests.approve_admin",
    "material_releases.read",
    "material_releases.manage",
  ]);
}

async function canWriteInvestorKycFiles(sessionUser: {
  id?: string;
  role?: string;
} | null | undefined) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  if (
    access.hasAny([
      "investor_documents.manage",
      "investors.manage",
      "investor_documents.review",
    ])
  ) {
    return true;
  }

  const investor = await resolveInvestorPortalContext(sessionUser);
  return investor.ok && investor.context.access.has("investor.portal.documents.submit");
}

async function canWriteInvestorPayoutProofFiles(sessionUser: {
  id?: string;
  role?: string;
} | null | undefined) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  return access.hasAny([
    "investor_payout.manage",
    "investor_payout.approve",
    "investor_payout.pay",
    "investor_payout.void",
  ]);
}

async function canReadScmGrnFile(
  relPath: string,
  sessionUser: { id?: string; role?: string } | null | undefined,
) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  const fileUrl = `/api/upload/${relPath}`;
  const attachment = await prisma.goodsReceiptAttachment.findFirst({
    where: { fileUrl },
    select: {
      goodsReceipt: {
        select: {
          warehouseId: true,
          purchaseOrder: {
            select: {
              createdById: true,
              purchaseRequisition: {
                select: {
                  createdById: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!attachment) return false;
  const warehouseId = attachment.goodsReceipt.warehouseId;
  const requesterUserId =
    attachment.goodsReceipt.purchaseOrder.purchaseRequisition?.createdById ??
    attachment.goodsReceipt.purchaseOrder.createdById ??
    null;

  if (
    access.can("goods_receipts.read", warehouseId) ||
    access.can("goods_receipts.manage", warehouseId) ||
    access.can("purchase_orders.manage", warehouseId) ||
    access.can("purchase_requisitions.manage", warehouseId) ||
    access.hasGlobal("supplier.feedback.manage") ||
    access.hasGlobal("suppliers.manage")
  ) {
    return true;
  }

  return requesterUserId !== null && requesterUserId === access.userId;
}

async function canReadScmMaterialFile(
  relPath: string,
  sessionUser: { id?: string; role?: string } | null | undefined,
) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  const fileUrl = `/api/upload/${relPath}`;
  const attachment = await prisma.materialRequestAttachment.findFirst({
    where: { fileUrl },
    select: {
      uploadedById: true,
      materialRequest: {
        select: {
          warehouseId: true,
          createdById: true,
        },
      },
    },
  });

  if (!attachment) return false;

  const warehouseId = attachment.materialRequest.warehouseId;
  if (
    access.can("material_requests.read", warehouseId) ||
    access.can("material_requests.manage", warehouseId) ||
    access.can("material_requests.endorse_supervisor", warehouseId) ||
    access.can("material_requests.endorse_project_manager", warehouseId) ||
    access.can("material_requests.approve_admin", warehouseId) ||
    access.can("material_releases.read", warehouseId) ||
    access.can("material_releases.manage", warehouseId)
  ) {
    return true;
  }

  return (
    attachment.uploadedById === access.userId ||
    attachment.materialRequest.createdById === access.userId
  );
}

async function canReadInvestorKycFile(
  relPath: string,
  sessionUser: { id?: string; role?: string } | null | undefined,
) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  const fileUrl = `/api/upload/${relPath}`;
  const document = await prisma.investorDocument.findFirst({
    where: { fileUrl },
    select: {
      investorId: true,
      uploadedById: true,
    },
  });

  if (!document) return false;

  if (
    access.hasAny([
      "investor_documents.read",
      "investor_documents.manage",
      "investor_documents.review",
      "investors.read",
      "investors.manage",
    ])
  ) {
    return true;
  }

  const investor = await resolveInvestorPortalContext(sessionUser);
  return (
    investor.ok &&
    investor.context.investorId === document.investorId &&
    investor.context.access.has("investor.portal.documents.read")
  );
}

async function canReadInvestorPayoutProofFile(
  relPath: string,
  sessionUser: { id?: string; role?: string } | null | undefined,
) {
  const access = await getAccessContext(sessionUser);
  if (!access.userId) return false;

  const fileUrl = `/api/upload/${relPath}`;
  const payout = await prisma.investorProfitPayout.findFirst({
    where: { paymentProofUrl: fileUrl },
    select: { id: true },
  });

  if (!payout) return false;

  return access.hasAny([
    "investor_payout.read",
    "investor_payout.manage",
    "investor_payout.approve",
    "investor_payout.pay",
    "investor_payout.void",
    "investor_statement.read",
  ]);
}

/* ---------------- POST (UPLOAD) ---------------- */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    // Get params (must be awaited in Next 15 dynamic routes)
    const { slug } = await params;
    const relPath = slug.join("/");
    const requiresScmProposalScope = isScmProposalPath(relPath);
    const requiresScmGrnScope = isScmGrnPath(relPath);
    const requiresScmMaterialScope = isScmMaterialPath(relPath);
    const requiresInvestorKycScope = isInvestorKycPath(relPath);
    const requiresInvestorPayoutProofScope = isInvestorPayoutProofPath(relPath);

    if (
      requiresScmProposalScope ||
      requiresScmGrnScope ||
      requiresScmMaterialScope ||
      requiresInvestorKycScope ||
      requiresInvestorPayoutProofScope
    ) {
      const session = await getServerSession(authOptions);
      const sessionUser = session?.user as { id?: string; role?: string } | undefined;

      if (!sessionUser?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const canWriteProposal = requiresScmProposalScope
        ? await canWriteScmProposalFiles(sessionUser)
        : true;
      const canWriteGrn = requiresScmGrnScope
        ? await canWriteScmGrnFiles(sessionUser)
        : true;
      const canWriteMaterial = requiresScmMaterialScope
        ? await canWriteScmMaterialFiles(sessionUser)
        : true;
      const canWriteInvestorKyc = requiresInvestorKycScope
        ? await canWriteInvestorKycFiles(sessionUser)
        : true;
      const canWriteInvestorPayoutProof = requiresInvestorPayoutProofScope
        ? await canWriteInvestorPayoutProofFiles(sessionUser)
        : true;
      if (!canWriteProposal || !canWriteGrn || !canWriteMaterial || !canWriteInvestorKyc || !canWriteInvestorPayoutProof) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const form = await req.formData();
    const file = form.get("file") as File;

    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const targetDir = path.join(rootUploadDir, relPath);
    await fs.mkdir(targetDir, { recursive: true });

    const filename = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '')}`;
    const filepath = path.join(targetDir, filename);

    await fs.writeFile(filepath, buffer);

    // Return API URL so that Next.js always goes through our GET handler,
    // which serves the real file bytes with the correct Content-Type.
    return NextResponse.json({ 
      success: true,
      url: `/api/upload/${relPath}/${filename}` 
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { 
        success: false,
        message: "Upload failed",
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 
      { status: 500 }
    );
  }
}

/* ---------------- GET (SERVE FILE) ---------------- */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const relPath = slug.join("/");
    
    if (relPath.includes("..")) {
      return NextResponse.json({ error: "Bad path" }, { status: 400 });
    }
    const requiresScmProposalScope = isScmProposalPath(relPath);
    const requiresScmGrnScope = isScmGrnPath(relPath);
    const requiresScmMaterialScope = isScmMaterialPath(relPath);
    const requiresInvestorKycScope = isInvestorKycPath(relPath);
    const requiresInvestorPayoutProofScope = isInvestorPayoutProofPath(relPath);
    const requiresProtectedScope =
      requiresScmProposalScope ||
      requiresScmGrnScope ||
      requiresScmMaterialScope ||
      requiresInvestorKycScope ||
      requiresInvestorPayoutProofScope;

    if (requiresProtectedScope) {
      const session = await getServerSession(authOptions);
      const sessionUser = session?.user as { id?: string; role?: string } | undefined;

      if (!sessionUser?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const canReadProposal = requiresScmProposalScope
        ? await canReadScmProposalFile(relPath, sessionUser)
        : true;
      const canReadGrn = requiresScmGrnScope
        ? await canReadScmGrnFile(relPath, sessionUser)
        : true;
      const canReadMaterial = requiresScmMaterialScope
        ? await canReadScmMaterialFile(relPath, sessionUser)
        : true;
      const canReadInvestorKyc = requiresInvestorKycScope
        ? await canReadInvestorKycFile(relPath, sessionUser)
        : true;
      const canReadInvestorPayoutProof = requiresInvestorPayoutProofScope
        ? await canReadInvestorPayoutProofFile(relPath, sessionUser)
        : true;
      if (!canReadProposal || !canReadGrn || !canReadMaterial || !canReadInvestorKyc || !canReadInvestorPayoutProof) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const filePath = path.join(rootUploadDir, relPath);
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": guessContentType(ext),
        "Cache-Control": requiresProtectedScope
          ? "private, no-store"
          : "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error('File serve error:', error);
    return NextResponse.json(
      { 
        error: "File not found",
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 404 }
    );
  }
}
