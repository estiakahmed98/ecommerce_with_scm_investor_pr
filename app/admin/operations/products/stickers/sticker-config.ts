export const STICKER_SIZE_PRESETS = {
  "50x30": {
    label: "Thermal 50 x 30 mm",
    widthMm: 50,
    minHeightMm: 30,
    radiusMm: 2.5,
    paddingMm: 2.5,
    gapMm: 3,
    sideWidthMm: 14,
    qrSizeMm: 12,
    barcodeHeightMm: 12,
    titleFontPx: 9,
    metaFontPx: 7,
    optionsFontPx: 6.5,
  },
  "58x40": {
    label: "Thermal 58 x 40 mm",
    widthMm: 58,
    minHeightMm: 40,
    radiusMm: 3,
    paddingMm: 3,
    gapMm: 4,
    sideWidthMm: 17,
    qrSizeMm: 15,
    barcodeHeightMm: 15,
    titleFontPx: 10,
    metaFontPx: 7.5,
    optionsFontPx: 7.5,
  },
  "60x40": {
    label: "Label 60 x 40 mm",
    widthMm: 60,
    minHeightMm: 40,
    radiusMm: 3,
    paddingMm: 3.5,
    gapMm: 4,
    sideWidthMm: 18,
    qrSizeMm: 16,
    barcodeHeightMm: 16,
    titleFontPx: 10,
    metaFontPx: 8,
    optionsFontPx: 8,
  },
  "100x50": {
    label: "Shipping 100 x 50 mm",
    widthMm: 100,
    minHeightMm: 50,
    radiusMm: 3.5,
    paddingMm: 4,
    gapMm: 4,
    sideWidthMm: 24,
    qrSizeMm: 21,
    barcodeHeightMm: 18,
    titleFontPx: 12,
    metaFontPx: 9,
    optionsFontPx: 8.5,
  },
} as const;

export type StickerSizeKey = keyof typeof STICKER_SIZE_PRESETS;

export const DEFAULT_STICKER_SIZE: StickerSizeKey = "60x40";

export function normalizeStickerSize(value?: string): StickerSizeKey {
  if (value && value in STICKER_SIZE_PRESETS) {
    return value as StickerSizeKey;
  }
  return DEFAULT_STICKER_SIZE;
}

export function normalizeCopies(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

export function normalizeBooleanFlag(value?: string, fallback = true) {
  if (value === undefined) return fallback;
  return value === "1" || value === "true";
}
