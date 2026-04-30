import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const code = await prisma.productCode.findFirst({
    where: {
      token,
      kind: "QRCODE",
      status: "ACTIVE",
    },
    include: {
      product: { select: { id: true, deleted: true } },
      variant: {
        select: {
          id: true,
          product: { select: { id: true, deleted: true } },
        },
      },
    },
  });

  const productId = code?.variant?.product.id ?? code?.product?.id;
  const isDeleted = code?.variant?.product.deleted ?? code?.product?.deleted;

  if (!productId || isDeleted) {
    return NextResponse.json({ error: "QR target not found" }, { status: 404 });
  }

  return NextResponse.redirect(new URL(`/ecommerce/products/${productId}`, req.url));
}
