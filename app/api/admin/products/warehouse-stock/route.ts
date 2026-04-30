import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

/* =========================
   GET PRODUCT STOCK BY WAREHOUSE
   Query: ?productId=1&warehouseId=1 or ?productIds=1,2,3&warehouseId=1
========================= */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("inventory.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const productIdParam = url.searchParams.get("productId");
    const productIdsParam = url.searchParams.get("productIds");
    const warehouseIdParam = url.searchParams.get("warehouseId");

    const warehouseId = warehouseIdParam ? Number(warehouseIdParam) : null;

    if (!warehouseId || Number.isNaN(warehouseId)) {
      return NextResponse.json(
        { error: "Valid warehouseId is required" },
        { status: 400 }
      );
    }

    if (!access.can("inventory.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let stockData;

    if (productIdParam && !Number.isNaN(Number(productIdParam))) {
      // Get stock for single product
      const productId = Number(productIdParam);
      
      stockData = await prisma.productVariant.findMany({
        where: { productId },
        include: {
          stockLevels: {
            where: { warehouseId },
            select: {
              quantity: true,
              reserved: true,
            },
          },
        },
      });

      // Calculate available stock for each variant
      const variantsWithStock = stockData.map(variant => {
        const stockLevel = variant.stockLevels[0];
        const quantity = stockLevel ? Number(stockLevel.quantity) : 0;
        const reserved = stockLevel ? Number(stockLevel.reserved) : 0;
        const available = quantity - reserved;

        return {
          id: variant.id,
          sku: variant.sku,
          price: Number(variant.price),
          currency: variant.currency,
          isDefault: variant.isDefault,
          options: variant.options,
          stock: {
            quantity,
            reserved,
            available,
          },
        };
      });

      return NextResponse.json({
        productId,
        warehouseId,
        variants: variantsWithStock,
      });
    }

    if (productIdsParam) {
      // Get stock for multiple products
      const productIds = productIdsParam.split(',').map(id => Number(id.trim())).filter(id => !Number.isNaN(id));
      
      if (productIds.length === 0) {
        return NextResponse.json(
          { error: "Valid productIds are required" },
          { status: 400 }
        );
      }

      stockData = await prisma.productVariant.findMany({
        where: { productId: { in: productIds } },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              basePrice: true,
              currency: true,
              image: true,
              available: true,
              type: true,
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
              brand: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          stockLevels: {
            where: { warehouseId },
            select: {
              quantity: true,
              reserved: true,
            },
          },
        },
      });

      // Group by product and calculate stock
      const productsWithStock = stockData.reduce((acc, variant) => {
        const product = variant.product;
        const stockLevel = variant.stockLevels[0];
        const quantity = stockLevel ? Number(stockLevel.quantity) : 0;
        const reserved = stockLevel ? Number(stockLevel.reserved) : 0;
        const available = quantity - reserved;

        if (!acc[product.id]) {
          acc[product.id] = {
            id: product.id,
            name: product.name,
            slug: product.name.toLowerCase().replace(/\s+/g, '-'),
            sku: product.sku,
            basePrice: Number(product.basePrice),
            currency: product.currency,
            image: product.image,
            available: product.available,
            type: product.type,
            category: product.category,
            brand: product.brand,
            defaultPrice: Number(product.basePrice),
            stock: 0, // Total stock across all variants
            variants: [],
          };
        }

        // Add variant with stock info
        acc[product.id].variants.push({
          id: variant.id,
          sku: variant.sku,
          price: Number(variant.price),
          currency: variant.currency,
          isDefault: variant.isDefault,
          options: variant.options,
          stock: {
            quantity,
            reserved,
            available,
          },
        });

        // Update total product stock
        acc[product.id].stock += available;

        return acc;
      }, {} as Record<number, any>);

      return NextResponse.json({
        warehouseId,
        products: Object.values(productsWithStock),
      });
    }

    return NextResponse.json(
      { error: "Either productId or productIds parameter is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("GET PRODUCT WAREHOUSE STOCK ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch product stock" },
      { status: 500 }
    );
  }
}
