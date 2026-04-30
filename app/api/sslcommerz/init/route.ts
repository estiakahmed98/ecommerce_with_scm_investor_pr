import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type SslcommerzInitBody = {
  orderId: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as SslcommerzInitBody | null;
    const orderId = Number(body?.orderId);

    if (!orderId || Number.isNaN(orderId)) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const gateway = await prisma.payment.findFirst({
      where: {
        paymentGatewayData: {
          path: ["type"],
          equals: "SSLCOMMERZ",
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const data: any = gateway?.paymentGatewayData || {};

    const storeId = String(data.storeId || "").trim();
    const storePassword = String(data.storePassword || "").trim();
    const sandbox = Boolean(data.sandbox);
    const successUrl = String(data.successUrl || "").trim();
    const failUrl = String(data.failUrl || "").trim();
    const cancelUrl = String(data.cancelUrl || "").trim();
    const ipnUrl = String(data.ipnUrl || "").trim();

    if (!storeId || !storePassword) {
      return NextResponse.json(
        { error: "SSLCommerz credentials are not configured" },
        { status: 400 },
      );
    }

    if (!successUrl || !failUrl || !cancelUrl) {
      return NextResponse.json(
        { error: "SSLCommerz success/fail/cancel URLs are not configured" },
        { status: 400 },
      );
    }

    const amount = Number((order as any).grand_total ?? (order as any).total ?? 0);
    if (!amount || Number.isNaN(amount)) {
      return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
    }

    const tranId = `order_${order.id}`;

    const form = new URLSearchParams();
    form.set("store_id", storeId);
    form.set("store_passwd", storePassword);
    form.set("total_amount", String(amount));
    form.set("currency", "BDT");
    form.set("tran_id", tranId);
    form.set("success_url", successUrl);
    form.set("fail_url", failUrl);
    form.set("cancel_url", cancelUrl);
    if (ipnUrl) form.set("ipn_url", ipnUrl);

    form.set("cus_name", String((order as any).name || "Customer"));
    form.set("cus_email", String((order as any).email || ""));
    form.set("cus_add1", String((order as any).address_details || ""));
    form.set("cus_city", String((order as any).district || ""));
    form.set("cus_country", String((order as any).country || "BD"));
    form.set("cus_phone", String((order as any).phone_number || ""));

    form.set("shipping_method", "Courier");
    form.set("product_name", "Order Payment");
    form.set("product_category", "Ecommerce");
    form.set("product_profile", "general");

    const endpoint = sandbox
      ? "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"
      : "https://securepay.sslcommerz.com/gwprocess/v4/api.php";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload) {
      return NextResponse.json(
        { error: "Failed to initiate SSLCommerz payment" },
        { status: 502 },
      );
    }

    const gatewayPageUrl = String(payload.GatewayPageURL || "");
    if (!gatewayPageUrl) {
      return NextResponse.json(
        { error: payload.failedreason || "GatewayPageURL missing" },
        { status: 502 },
      );
    }

    return NextResponse.json({ redirectUrl: gatewayPageUrl, tranId });
  } catch (error) {
    console.error("SSLCOMMERZ INIT ERROR:", error);
    return NextResponse.json(
      { error: "Failed to initiate SSLCommerz payment" },
      { status: 500 },
    );
  }
}
