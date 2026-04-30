import { prisma } from "@/lib/prisma";

import StickerPrintToolbar from "./StickerPrintToolbar";
import {
  STICKER_SIZE_PRESETS,
  normalizeBooleanFlag,
  normalizeCopies,
  normalizeStickerSize,
} from "./sticker-config";

export const dynamic = "force-dynamic";

type SearchParams = {
  variantIds?: string;
  size?: string;
  copies?: string;
  qr?: string;
  price?: string;
};

function parseVariantIds(raw?: string) {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );
}

function formatOptions(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return "";
  }

  return Object.entries(options as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

function buildCodeImageUrl(codeId: number) {
  return `/api/product-codes/${codeId}/image?format=svg`;
}

export default async function StickerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const variantIds = parseVariantIds(params.variantIds);
  const selectedSize = normalizeStickerSize(params.size);
  const copies = normalizeCopies(params.copies);
  const includeQr = normalizeBooleanFlag(params.qr, true);
  const includePrice = normalizeBooleanFlag(params.price, true);
  const sizePreset = STICKER_SIZE_PRESETS[selectedSize];

  if (variantIds.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-lg font-semibold text-foreground">No variants selected</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the product manager, choose one or more variants, then use the sticker print action.
        </p>
      </main>
    );
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        select: {
          id: true,
          name: true,
        },
      },
      codes: {
        where: { isPrimary: true, status: "ACTIVE" },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });

  const sortedVariants = variantIds
    .map((variantId) => variants.find((variant) => variant.id === variantId))
    .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant));

  const labels = sortedVariants.flatMap((variant) =>
    Array.from({ length: copies }, (_, copyIndex) => ({
      variant,
      copyIndex: copyIndex + 1,
    })),
  );

  return (
    <main className="print-sticker-screen mx-auto max-w-7xl px-6 py-8">
      <StickerPrintToolbar
        count={sortedVariants.length}
        copies={copies}
        size={selectedSize}
        includeQr={includeQr}
        includePrice={includePrice}
        variantIds={variantIds}
        basePath="/admin/operations/products/stickers"
      />

      <section className="sticker-preview-shell">
        <section className="sticker-sheet">
        {labels.map(({ variant, copyIndex }) => {
          const barcode = variant.codes.find((code) => code.kind === "BARCODE") ?? null;
          const qrCode = variant.codes.find((code) => code.kind === "QRCODE") ?? null;
          const optionsText = formatOptions(variant.options);

          return (
            <article key={`${variant.id}-${copyIndex}`} className="sticker-card">
              <div className="sticker-topline" />
              <div className="sticker-header">
                <div className="sticker-header-row">
                  <p className="sticker-title">{variant.product.name}</p>
                  <span className="sticker-badge">Variant #{variant.id}</span>
                </div>
                <div className="sticker-sku-row">
                  <span className="sticker-sku-label">SKU</span>
                  <p className="sticker-sku">{variant.sku}</p>
                </div>
                {optionsText ? (
                  <p className="sticker-options">{optionsText}</p>
                ) : (
                  <p className="sticker-options sticker-options-empty">Standard variant</p>
                )}
              </div>

              <div className="sticker-body">
                <div className="sticker-barcode-wrap">
                  <div className="sticker-panel-title">Barcode</div>
                  {barcode ? (
                    <img
                      src={buildCodeImageUrl(barcode.id)}
                      alt={`Barcode for ${variant.sku}`}
                      className="sticker-barcode"
                    />
                  ) : (
                    <div className="sticker-missing">Barcode missing</div>
                  )}
                  {barcode ? <p className="sticker-code-value">{barcode.value}</p> : null}
                </div>

                <div className="sticker-side">
                  {includeQr && qrCode ? (
                    <div className="sticker-qr-wrap">
                      <div className="sticker-panel-title">QR</div>
                      <img
                        src={buildCodeImageUrl(qrCode.id)}
                        alt={`QR code for ${variant.sku}`}
                        className="sticker-qr"
                      />
                    </div>
                  ) : includeQr ? (
                    <div className="sticker-missing">QR missing</div>
                  ) : null}
                  <div className="sticker-meta">
                    {includePrice ? (
                      <p>
                        {variant.currency} {String(variant.price)}
                      </p>
                    ) : null}
                    <p>Variant #{variant.id}</p>
                    {copies > 1 ? (
                      <p>
                        Copy {copyIndex}/{copies}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        </section>
      </section>

      <style>{`
        @page {
          size: A4;
          margin: 10mm;
        }

        .print-sticker-screen {
          color: #111827;
        }

        .sticker-preview-shell {
          border-radius: 24px;
          background:
            radial-gradient(circle at top left, rgba(226, 232, 240, 0.9), transparent 28%),
            linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.92));
          padding: 18px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
        }

        .sticker-sheet {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(${sizePreset.widthMm}mm, 1fr));
          gap: ${sizePreset.gapMm}mm;
        }

        .sticker-card {
          box-sizing: border-box;
          width: ${sizePreset.widthMm}mm;
          min-height: ${sizePreset.minHeightMm}mm;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: ${sizePreset.radiusMm}mm;
          background: #fff;
          color: #111827;
          padding: ${sizePreset.paddingMm}mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          break-inside: avoid;
          page-break-inside: avoid;
          box-shadow:
            0 8px 22px rgba(15, 23, 42, 0.08),
            0 1px 0 rgba(255,255,255,0.7) inset;
          position: relative;
          overflow: hidden;
        }

        .sticker-topline {
          position: absolute;
          inset: 0 0 auto 0;
          height: 2.2mm;
          background: linear-gradient(90deg, #111827, #334155 52%, #94a3b8);
        }

        .sticker-header {
          margin-bottom: 2.5mm;
          padding-top: 1.5mm;
        }

        .sticker-header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 2mm;
          margin-bottom: 1.4mm;
        }

        .sticker-title {
          font-size: ${sizePreset.titleFontPx}px;
          font-weight: 700;
          line-height: 1.15;
          margin: 0;
          letter-spacing: -0.02em;
          max-width: 70%;
        }

        .sticker-badge {
          flex-shrink: 0;
          border-radius: 999px;
          background: #f1f5f9;
          color: #475569;
          padding: 0.8mm 1.6mm;
          font-size: ${Math.max(sizePreset.metaFontPx - 1, 6)}px;
          line-height: 1;
          font-weight: 600;
        }

        .sticker-sku-row {
          display: flex;
          align-items: baseline;
          gap: 1.5mm;
          margin-bottom: 1mm;
        }

        .sticker-sku-label {
          color: #64748b;
          font-size: ${Math.max(sizePreset.metaFontPx - 1, 6)}px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .sticker-sku,
        .sticker-options,
        .sticker-meta {
          font-size: ${sizePreset.metaFontPx}px;
          line-height: 1.2;
          margin: 0;
        }

        .sticker-options {
          font-size: ${sizePreset.optionsFontPx}px;
          color: #4b5563;
          margin-top: 0;
          line-height: 1.25;
        }

        .sticker-options-empty {
          color: #94a3b8;
        }

        .sticker-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) ${
            includeQr ? `${sizePreset.sideWidthMm}mm` : "auto"
          };
          gap: 2mm;
          align-items: stretch;
        }

        .sticker-barcode-wrap {
          min-width: 0;
          border-radius: 2.5mm;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          padding: 2mm 2mm 1.4mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .sticker-panel-title {
          margin: 0 0 1mm;
          color: #64748b;
          font-size: ${Math.max(sizePreset.metaFontPx - 1, 6)}px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .sticker-barcode {
          display: block;
          width: 100%;
          height: ${sizePreset.barcodeHeightMm}mm;
          object-fit: contain;
        }

        .sticker-code-value {
          margin: 0.6mm 0 0;
          text-align: center;
          color: #475569;
          font-size: ${Math.max(sizePreset.metaFontPx - 1, 6)}px;
          line-height: 1;
          letter-spacing: 0.02em;
        }

        .sticker-side {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          justify-content: space-between;
          gap: 1.5mm;
        }

        .sticker-qr-wrap {
          border-radius: 2.5mm;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: linear-gradient(180deg, #ffffff, #f8fafc);
          padding: 1.6mm;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .sticker-qr {
          width: ${sizePreset.qrSizeMm}mm;
          height: ${sizePreset.qrSizeMm}mm;
          object-fit: contain;
        }

        .sticker-meta {
          text-align: center;
          color: #4b5563;
          border-radius: 2.5mm;
          background: #f8fafc;
          padding: 1.4mm 1mm;
          border: 1px solid rgba(148, 163, 184, 0.16);
        }

        .sticker-missing {
          font-size: 8px;
          color: #b91c1c;
          display: grid;
          place-items: center;
          min-height: 14mm;
          border-radius: 2.5mm;
          border: 1px dashed rgba(185, 28, 28, 0.25);
          background: rgba(254, 242, 242, 0.9);
        }

        @media print {
          html, body {
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .print-sticker-screen,
          .print-sticker-screen * {
            visibility: visible !important;
          }

          .print-sticker-screen {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .sticker-preview-shell {
            padding: 0 !important;
            background: #fff !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .sticker-sheet {
            padding: 0;
          }

          .sticker-card {
            box-shadow: none !important;
          }

          main {
            max-width: none !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </main>
  );
}
