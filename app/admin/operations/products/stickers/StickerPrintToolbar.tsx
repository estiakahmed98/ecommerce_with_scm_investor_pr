"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  STICKER_SIZE_PRESETS,
  type StickerSizeKey,
} from "./sticker-config";

type Props = {
  count: number;
  copies: number;
  size: StickerSizeKey;
  includeQr: boolean;
  includePrice: boolean;
  variantIds: number[];
  basePath?: string;
};

export default function StickerPrintToolbar({
  count,
  copies,
  size,
  includeQr,
  includePrice,
  variantIds,
  basePath = "/admin/operations/products/stickers",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const updateParams = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set("variantIds", variantIds.join(","));
    params.set("size", patch.size ?? size);
    params.set("copies", patch.copies ?? String(copies));
    params.set("qr", patch.qr ?? (includeQr ? "1" : "0"));
    params.set("price", patch.price ?? (includePrice ? "1" : "0"));

    startTransition(() => {
      router.replace(`${basePath}?${params.toString()}`);
    });
  };

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4 print:hidden">
      <div className="min-w-[220px]">
        <p className="text-sm font-medium text-foreground">Sticker Preview</p>
        <p className="text-xs text-muted-foreground">
          {count} variant label{count === 1 ? "" : "s"} and {copies} cop
          {copies === 1 ? "y" : "ies"} each
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="sticker-size">Sticker Size</Label>
          <select
            id="sticker-size"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={size}
            onChange={(event) => updateParams({ size: event.target.value })}
            disabled={isPending}
          >
            {Object.entries(STICKER_SIZE_PRESETS).map(([value, preset]) => (
              <option key={value} value={value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sticker-copies">Copies Per Variant</Label>
          <Input
            id="sticker-copies"
            type="number"
            min={1}
            max={50}
            value={copies}
            disabled={isPending}
            onChange={(event) => updateParams({ copies: event.target.value || "1" })}
            className="w-24"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={includeQr}
            onCheckedChange={(checked) =>
              updateParams({ qr: Boolean(checked) ? "1" : "0" })
            }
            disabled={isPending}
          />
          Show QR
        </label>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={includePrice}
            onCheckedChange={(checked) =>
              updateParams({ price: Boolean(checked) ? "1" : "0" })
            }
            disabled={isPending}
          />
          Show Price
        </label>

        <div>
          <Button type="button" onClick={() => window.print()} disabled={isPending}>
            <Printer className="h-4 w-4" />
            Print Stickers
          </Button>
        </div>
      </div>
    </div>
  );
}
