import bwipjs from "bwip-js";
import QRCode from "qrcode";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const svgHeaders = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "private, max-age=3600",
} as const;

const pngHeaders = {
  "Content-Type": "image/png",
  "Cache-Control": "private, max-age=3600",
} as const;

function sanitizeFilename(input: string) {
  return input.replace(/[^A-Z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function getBarcodeEncoder(symbology: string) {
  switch (symbology) {
    case "EAN13":
      return "ean13";
    case "CODE128":
    default:
      return "code128";
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid code id" }, { status: 400 });
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "svg").toLowerCase();
    if (format !== "svg" && format !== "png") {
      return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }

    const download = url.searchParams.get("download") === "1";

    const code = await prisma.productCode.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        symbology: true,
        value: true,
        variantId: true,
      },
    });

    if (!code) {
      return NextResponse.json({ error: "Code not found" }, { status: 404 });
    }

    const filenameBase = sanitizeFilename(
      `${code.kind}-${code.symbology}-${code.variantId ?? code.id}`,
    );
    const disposition = `${download ? "attachment" : "inline"}; filename="${filenameBase}.${format}"`;

    if (code.kind === "QRCODE") {
      if (format === "svg") {
        const svg = await QRCode.toString(code.value, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 1,
          width: 256,
        });
        return new NextResponse(svg, {
          headers: {
            ...svgHeaders,
            "Content-Disposition": disposition,
          },
        });
      }

      const png = await QRCode.toBuffer(code.value, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
      });
      return new NextResponse(new Uint8Array(png), {
        headers: {
          ...pngHeaders,
          "Content-Disposition": disposition,
        },
      });
    }

    const barcodeOptions = {
      bcid: getBarcodeEncoder(code.symbology),
      text: code.value,
      includetext: true,
      textxalign: "center",
      scale: format === "png" ? 3 : 2,
      height: 12,
      paddingwidth: 8,
      paddingheight: 6,
    } as const;

    if (format === "svg") {
      const svg = bwipjs.toSVG(barcodeOptions);
      return new NextResponse(svg, {
        headers: {
          ...svgHeaders,
          "Content-Disposition": disposition,
        },
      });
    }

    const png = await bwipjs.toBuffer(barcodeOptions);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        ...pngHeaders,
        "Content-Disposition": disposition,
      },
    });
  } catch (error) {
    console.error("GET PRODUCT CODE IMAGE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to generate code image" },
      { status: 500 },
    );
  }
}
