import { randomUUID } from "crypto";
import {
  Prisma,
  ProductCodeKind,
  ProductCodeSymbology,
} from "@/generated/prisma";

const FALLBACK_APP_URL = "http://localhost:3000";

function getAppUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    FALLBACK_APP_URL;
  return raw.replace(/\/+$/, "");
}

export function buildBarcodeValue(productId: number, variantId: number) {
  return `UEV-${String(productId).padStart(6, "0")}-${String(variantId).padStart(4, "0")}`;
}

export function buildQrToken() {
  return randomUUID();
}

export function buildQrValue(token: string) {
  return `${getAppUrl()}/scan/v/${token}`;
}

type EnsureVariantCodesInput = {
  productId: number;
  variantId: number;
  regenerate?: boolean;
};

export async function ensureVariantCodes(
  tx: Prisma.TransactionClient,
  { productId, variantId, regenerate = false }: EnsureVariantCodesInput,
) {
  if (regenerate) {
    await tx.productCode.deleteMany({
      where: { variantId },
    });
  }

  const existing = await tx.productCode.findMany({
    where: {
      variantId,
      isPrimary: true,
      status: "ACTIVE",
      kind: { in: [ProductCodeKind.BARCODE, ProductCodeKind.QRCODE] },
    },
    orderBy: { id: "asc" },
  });

  const hasBarcode = existing.some((code) => code.kind === ProductCodeKind.BARCODE);
  const hasQr = existing.some((code) => code.kind === ProductCodeKind.QRCODE);

  if (!hasBarcode) {
    await tx.productCode.create({
      data: {
        productId,
        variantId,
        kind: ProductCodeKind.BARCODE,
        symbology: ProductCodeSymbology.CODE128,
        value: buildBarcodeValue(productId, variantId),
        isPrimary: true,
        status: "ACTIVE",
      },
    });
  }

  if (!hasQr) {
    const token = buildQrToken();
    await tx.productCode.create({
      data: {
        productId,
        variantId,
        kind: ProductCodeKind.QRCODE,
        symbology: ProductCodeSymbology.QR,
        value: buildQrValue(token),
        token,
        isPrimary: true,
        status: "ACTIVE",
      },
    });
  }

  return tx.productCode.findMany({
    where: {
      variantId,
      isPrimary: true,
      status: "ACTIVE",
    },
    orderBy: { id: "asc" },
  });
}
