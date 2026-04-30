import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- SITE INFO ----------
let SITE_NAME = "ECOMMERCE";
let SITE_WEBSITE = "www.example.com";
let SITE_EMAIL = "support@example.com";
let SITE_PHONE = "+880-XXXXXXXXXX";
let SITE_ADDRESS =
  "Level 2, House 1A, Road 16/A, Gulshan-1, Dhaka 1212.";

// Fetch site settings from database
async function getSiteSettings() {
  try {
    const response = await fetch(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/site`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }
    );

    if (response.ok) {
      const settings = await response.json();
      return {
        SITE_NAME: settings.siteTitle || SITE_NAME,
        SITE_WEBSITE: settings.siteTitle
          ? settings.siteTitle.toLowerCase().replace(/\s+/g, "") + ".com"
          : SITE_WEBSITE,
        SITE_EMAIL: settings.contactEmail || SITE_EMAIL,
        SITE_PHONE: settings.contactNumber || SITE_PHONE,
        SITE_ADDRESS: settings.address || SITE_ADDRESS,
      };
    }
  } catch (error) {
    console.error("Failed to fetch site settings:", error);
  }

  return {
    SITE_NAME,
    SITE_WEBSITE,
    SITE_EMAIL,
    SITE_PHONE,
    SITE_ADDRESS,
  };
}

// ---------- COLORS ----------
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
const TEXT = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.45, 0.52);
const BORDER = rgb(0.82, 0.84, 0.88);

// table header
const TABLE_HEAD_BG = BLACK;
const TABLE_HEAD_TXT = WHITE;

const money = (n: any) => Number(n ?? 0).toFixed(2);

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function safeText(v: any, fallback = "—") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function getAppBaseUrl(req: Request) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  return new URL(req.url).origin.replace(/\/+$/, "");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const sessionName = session.user.name || "Customer";
    const sessionEmail = session.user.email || "";

    const { orderId } = await params;
    const id = Number.parseInt(String(orderId), 10);

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const order = await db.order.findFirst({
      where: { id, userId },
      select: {
        id: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        payment_method: true,
        grand_total: true,
        total: true,
        currency: true,
        Vat_total: true,
        discount_total: true,
        taxSnapshot: true,
        coupon: {
          select: {
            id: true,
            code: true,
            discountType: true,
            discountValue: true,
          },
        },
        orderItems: {
          select: {
            id: true,
            productId: true,
            price: true,
            quantity: true,
            VatAmount: true,
            product: {
              select: {
                name: true,
                sku: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const userProfile = await db.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });

    const sessionPhone = userProfile?.phone || "—";

    const currency = order.currency || "BDT";
    const invoiceId = `INV${String(order.id).padStart(9, "0")}`;
    const orderDate = formatDate(new Date(order.createdAt));
    const orderRef = String(order.id);
    const invoiceQrValue = `${getAppBaseUrl(
      req
    )}/ecommerce/user/orders/${order.id}`;

    const items = order.orderItems ?? [];
    const subTotal = items.reduce(
      (s, it) => s + Number(it.price ?? 0) * Number(it.quantity ?? 1),
      0
    );

    const vatTotal = Number(order.Vat_total ?? 0);
    const discountTotal = Number(order.discount_total ?? 0);
    const taxCharge = Number(
      (order.taxSnapshot as { totalTaxCharge?: number } | null)
        ?.totalTaxCharge ?? vatTotal
    );
    const grand = Number(order.grand_total ?? order.total ?? subTotal);
    const delivery = Math.max(grand - subTotal - taxCharge + discountTotal, 0);

    const siteSettings = await getSiteSettings();
    SITE_NAME = siteSettings.SITE_NAME;
    SITE_WEBSITE = siteSettings.SITE_WEBSITE;
    SITE_EMAIL = siteSettings.SITE_EMAIL;
    SITE_PHONE = siteSettings.SITE_PHONE;
    SITE_ADDRESS = siteSettings.SITE_ADDRESS;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const invoiceQrPng = await QRCode.toBuffer(invoiceQrValue, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: {
        dark: "#111827",
        light: "#FFFFFF",
      },
    });

    const invoiceQrImage = await pdf.embedPng(invoiceQrPng);

    const W = 595.28;
    const H = 841.89;
    const marginX = 38;

    const page = pdf.addPage([W, H]);

    const text = (
      t: string,
      x: number,
      y: number,
      size = 10,
      b = false,
      color = TEXT
    ) => {
      page.drawText(String(t ?? ""), {
        x,
        y,
        size,
        font: b ? bold : font,
        color,
      });
    };

    const centerText = (
      t: string,
      centerX: number,
      y: number,
      size = 12,
      b = false
    ) => {
      const f = b ? bold : font;
      const w = f.widthOfTextAtSize(String(t ?? ""), size);
      page.drawText(String(t ?? ""), {
        x: centerX - w / 2,
        y,
        size,
        font: f,
        color: TEXT,
      });
    };

    const rightText = (
      t: string,
      rightX: number,
      y: number,
      size = 10,
      b = false,
      color = TEXT
    ) => {
      const f = b ? bold : font;
      const w = f.widthOfTextAtSize(String(t ?? ""), size);
      page.drawText(String(t ?? ""), {
        x: rightX - w,
        y,
        size,
        font: f,
        color,
      });
    };

    const rect = (
      x: number,
      y: number,
      w: number,
      h: number,
      fill: any,
      border = false
    ) => {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: fill,
        borderColor: border ? BORDER : undefined,
        borderWidth: border ? 1 : 0,
      });
    };

    const line = (x1: number, y1: number, x2: number, y2: number) => {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 1,
        color: BORDER,
      });
    };

    const wrapText = (
      value: string,
      maxWidth: number,
      size = 9.2,
      isBold = false
    ) => {
      const f = isBold ? bold : font;
      const raw = String(value ?? "").trim();

      if (!raw) return ["—"];

      const words = raw.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = "";

      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        const testWidth = f.widthOfTextAtSize(test, size);

        if (testWidth <= maxWidth) {
          current = test;
          continue;
        }

        if (current) {
          lines.push(current);
          current = "";
        }

        if (f.widthOfTextAtSize(word, size) <= maxWidth) {
          current = word;
          continue;
        }

        let chunk = "";
        for (const ch of word) {
          const chunkTest = chunk + ch;
          if (f.widthOfTextAtSize(chunkTest, size) <= maxWidth) {
            chunk = chunkTest;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }

      if (current) lines.push(current);

      return lines.length ? lines : ["—"];
    };

    const drawWrappedText = (
      value: string,
      x: number,
      topY: number,
      maxWidth: number,
      size = 9.2,
      isBold = false,
      color = TEXT,
      lineGap = 11
    ) => {
      const lines = wrapText(value, maxWidth, size, isBold);

      lines.forEach((ln, i) => {
        page.drawText(ln, {
          x,
          y: topY - i * lineGap,
          size,
          font: isBold ? bold : font,
          color,
        });
      });

      return lines.length;
    };

    let y = H;

    // ========= TOP HEADER =========
    const headerH = 70;
    rect(0, H - headerH, W, headerH, WHITE);

    centerText(SITE_NAME, W / 2, H - 30, 18, true);
    centerText(SITE_WEBSITE, W / 2, H - 48, 10, false);

    y = H - headerH - 18;

    text(`${SITE_NAME} Limited`, marginX, y, 11, true);
    y -= 14;

    const addrLines = [SITE_ADDRESS, SITE_EMAIL, SITE_PHONE].filter(
      Boolean
    ) as string[];

    for (const l of addrLines) {
      text(l, marginX, y, 9.5, false, MUTED);
      y -= 12;
    }

    const metaRight = W - marginX;
    let my = H - headerH - 18;

    rightText(`Invoice ID : ${invoiceId}`, metaRight, my, 10, true);
    my -= 14;
    rightText(`Order ID : ${orderRef}`, metaRight, my, 10, true);
    my -= 14;
    rightText(`Order Date : ${orderDate}`, metaRight, my, 10, true);
    my -= 14;
    rightText(
      `Payment Mode : ${safeText(order.payment_method, "Online")}`,
      metaRight,
      my,
      10,
      true
    );
    my -= 12;

    const qrSize = 64;
    const qrX = metaRight - qrSize;
    const qrY = my - qrSize;

    page.drawImage(invoiceQrImage, {
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
    });

    rightText("Scan to open order", metaRight, qrY - 10, 8.5, false, MUTED);

    let cursor = Math.min(y, qrY - 18) - 18;

    const tableW = W - marginX * 2;
    const headH = 22;
    const rowH = 22;

    const drawTableHead = (titleCols: Array<{ label: string; x: number }>) => {
      rect(marginX, cursor - headH, tableW, headH, TABLE_HEAD_BG, true);

      for (const c of titleCols) {
        page.drawText(c.label, {
          x: c.x,
          y: cursor - 15,
          size: 9.5,
          font: bold,
          color: TABLE_HEAD_TXT,
        });
      }

      cursor -= headH;
    };

    // ========= CUSTOMER DETAILS =========
    text("Customer Details", marginX, cursor, 11, true);
    cursor -= 14;

    const col1 = marginX + 10;
    const col2 = marginX + tableW * 0.36;
    const col3 = marginX + tableW * 0.72;

    drawTableHead([
      { label: "Name", x: col1 },
      { label: "Email Address", x: col2 },
      { label: "Contact Number", x: col3 },
    ]);

    rect(marginX, cursor - rowH, tableW, rowH, WHITE, true);
    text(safeText(sessionName), col1, cursor - 15, 9.5);
    text(safeText(sessionEmail), col2, cursor - 15, 9.5);
    text(safeText(sessionPhone), col3, cursor - 15, 9.5);
    cursor -= rowH + 18;

    // ========= ITEM DETAILS =========
    text("Item Details", marginX, cursor, 11, true);
    cursor -= 14;

    const itemTableLeft = marginX;
    const itemTableRight = marginX + tableW;

    const itemColItemW = 235;
    const itemColSkuW = 95;
    const itemColQtyW = 40;
    const itemColUnitW = 75;
    const itemColTotalW =
      tableW -
      itemColItemW -
      itemColSkuW -
      itemColQtyW -
      itemColUnitW;

    const itemNameX = itemTableLeft + 10;
    const itemSkuX = itemTableLeft + itemColItemW + 10;
    const itemQtyX = itemTableLeft + itemColItemW + itemColSkuW + 10;
    const itemUnitHeaderX =
      itemTableLeft + itemColItemW + itemColSkuW + itemColQtyW + 8;
    const itemTotalHeaderX =
      itemTableLeft +
      itemColItemW +
      itemColSkuW +
      itemColQtyW +
      itemColUnitW +
      8;

    const itemUnitRightX =
      itemTableLeft +
      itemColItemW +
      itemColSkuW +
      itemColQtyW +
      itemColUnitW -
      10;

    const itemTotalRightX = itemTableRight - 10;

    drawTableHead([
      { label: "Item", x: itemNameX },
      { label: "SKU", x: itemSkuX },
      { label: "Qty", x: itemQtyX },
      { label: `Unit Price (${currency})`, x: itemUnitHeaderX },
      { label: `Total (${currency})`, x: itemTotalHeaderX },
    ]);

    const itemFontSize = 9.2;
    const itemLineGap = 11;
    const itemTopPadding = 14;
    const itemBottomPadding = 8;
    const itemNameMaxWidth = itemColItemW - 20;
    const skuFontSize = 8.6;
    const skuLineGap = 10;
    const skuMaxWidth = itemColSkuW - 12;

    for (const item of items) {
      const itemName = item?.product?.name
        ? safeText(item.product.name)
        : `Product #${safeText(item?.productId)}`;

      const sku = safeText(item?.product?.sku);
      const qty = Number(item.quantity ?? 1);
      const unitPrice = Number(item.price ?? 0);
      const lineTotal = unitPrice * qty;

      const wrappedNameLines = wrapText(
        itemName,
        itemNameMaxWidth,
        itemFontSize,
        false
      );

      const wrappedSkuLines = wrapText(sku, skuMaxWidth, skuFontSize, false);

      const lineCount = Math.max(
        1,
        wrappedNameLines.length,
        wrappedSkuLines.length
      );

      const itemRowH = Math.max(
        24,
        itemTopPadding + itemBottomPadding + (lineCount - 1) * itemLineGap
      );

      rect(itemTableLeft, cursor - itemRowH, tableW, itemRowH, WHITE, true);

      line(
        itemTableLeft + itemColItemW,
        cursor - itemRowH,
        itemTableLeft + itemColItemW,
        cursor
      );
      line(
        itemTableLeft + itemColItemW + itemColSkuW,
        cursor - itemRowH,
        itemTableLeft + itemColItemW + itemColSkuW,
        cursor
      );
      line(
        itemTableLeft + itemColItemW + itemColSkuW + itemColQtyW,
        cursor - itemRowH,
        itemTableLeft + itemColItemW + itemColSkuW + itemColQtyW,
        cursor
      );
      line(
        itemTableLeft + itemColItemW + itemColSkuW + itemColQtyW + itemColUnitW,
        cursor - itemRowH,
        itemTableLeft + itemColItemW + itemColSkuW + itemColQtyW + itemColUnitW,
        cursor
      );

      drawWrappedText(
        itemName,
        itemNameX,
        cursor - itemTopPadding,
        itemNameMaxWidth,
        itemFontSize,
        false,
        TEXT,
        itemLineGap
      );

      drawWrappedText(
        sku,
        itemSkuX,
        cursor - itemTopPadding,
        skuMaxWidth,
        skuFontSize,
        false,
        MUTED,
        skuLineGap
      );

      text(
        String(qty),
        itemQtyX,
        cursor - itemTopPadding,
        itemFontSize,
        false,
        TEXT
      );

      rightText(
        money(unitPrice),
        itemUnitRightX,
        cursor - itemTopPadding,
        itemFontSize,
        false,
        TEXT
      );

      rightText(
        money(lineTotal),
        itemTotalRightX,
        cursor - itemTopPadding,
        itemFontSize,
        false,
        TEXT
      );

      cursor -= itemRowH;
    }

    if (items.length === 0) {
      const emptyRowH = 24;
      rect(itemTableLeft, cursor - emptyRowH, tableW, emptyRowH, WHITE, true);
      text("No items found", itemNameX, cursor - 14, 9.2, false, MUTED);
      cursor -= emptyRowH;
      cursor -= 18; // Added this line
    }

    // ========= PAYMENT SUMMARY =========
    text("Payment Summary", marginX, cursor, 11, true);
    cursor -= 14;

    drawTableHead([
      { label: "Particular", x: col1 },
      { label: `Amount (${currency})`, x: marginX + tableW - 110 },
    ]);

    const payRowH = 20;
    const summaryRows: Array<{ label: string; value: number }> = [
      { label: `Total Base Amount (${items.length || 1} Items)`, value: subTotal },
      { label: "Delivery Charge", value: delivery },
      { label: "Tax", value: taxCharge },
      { label: "Add-ons", value: 0 },
      { label: "Convenience Charge", value: 0 },
    ];

    for (const r of summaryRows) {
      rect(marginX, cursor - payRowH, tableW, payRowH, WHITE, true);
      text(r.label, col1, cursor - 14, 9.2, false, MUTED);
      rightText(
        money(r.value),
        marginX + tableW - 10,
        cursor - 14,
        9.2,
        false,
        TEXT
      );
      cursor -= payRowH;
    }

    // Add coupon discount if applicable
    if (discountTotal > 0 && order.coupon) {
      rect(marginX, cursor - payRowH, tableW, payRowH, WHITE, true);
      const discountLabel = `Coupon Discount (${order.coupon.code})`;
      text(discountLabel, col1, cursor - 14, 9.2, false, rgb(0.13, 0.6, 0.13));
      rightText(
        `-${money(discountTotal)}`,
        marginX + tableW - 10,
        cursor - 14,
        9.2,
        false,
        rgb(0.13, 0.6, 0.13)
      );
      cursor -= payRowH;
    }

    rect(marginX, cursor - payRowH, tableW, payRowH, WHITE, true);
    text("Subtotal", col1, cursor - 14, 9.2, true);
    rightText(
      money(subTotal + delivery + taxCharge - discountTotal),
      marginX + tableW - 10,
      cursor - 14,
      9.2,
      true
    );
    cursor -= payRowH;

    line(marginX, cursor - 3, marginX + tableW, cursor - 3);
    cursor -= 10;

    rect(marginX, cursor - payRowH, tableW, payRowH, WHITE, true);
    text("Total Payment", col1, cursor - 14, 10, true);
    rightText(money(grand), marginX + tableW - 10, cursor - 14, 10, true);

    // ========= FOOTER =========
    const footerY = 40;
    line(marginX, footerY + 20, W - marginX, footerY + 20);
    text(
      `Generated by ${SITE_NAME} • ${SITE_EMAIL}`,
      marginX,
      footerY + 8,
      9,
      false,
      MUTED
    );

    const pdfBytes = await pdf.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${SITE_NAME}-Invoice-${order.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("Invoice PDF error:", err);
    return NextResponse.json(
      {
        error: "Failed to generate invoice",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}