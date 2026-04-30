// Temporary types until Prisma generates them
export interface Product {
  id: number;
  name: string;
  slug: string;
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'BUNDLE';
  sku?: string | null;
  categoryId: number;
  brandId?: number | null;
  writerId?: number | null;
  publisherId?: number | null;
  description: string;
  shortDesc?: string | null;
  basePrice: number;
  originalPrice?: number | null;
  currency: string;
  weight?: number | null;
  dimensions?: any;
  VatClassId?: number | null;
  digitalAssetId?: number | null;
  serviceDurationMinutes?: number | null;
  serviceLocation?: string | null;
  serviceOnlineLink?: string | null;
  available: boolean;
  featured?: boolean;
  image?: string | null;
  gallery?: string[];
  videoUrl?: string | null;
  soldCount: number;
  ratingAvg: number;
  ratingCount: number;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  lowStockThreshold: number;
  bundleStockLimit?: number | null;
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: number;
  productId: number;
  sku: string;
  price: number;
  currency: string;
  stock: number;
  digitalAssetId?: number | null;
  options: any;
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;
  active: boolean;
  lowStockThreshold: number;
  costPrice?: number | null;
  stockLevels?: StockLevel[];
}

export interface ProductBundleItem {
  id: number;
  bundleId: number;
  productId: number;
  quantity: number;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  bundle: Product;
  product: Product;
}

export interface StockLevel {
  id: number;
  warehouseId: number;
  productVariantId: number;
  quantity: number;
  reserved: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrismaClient {
  productBundleItem: {
    findMany: (args: any) => Promise<ProductBundleItem[]>;
    findUnique: (args: any) => Promise<ProductBundleItem | null>;
    create: (args: any) => Promise<ProductBundleItem>;
    update: (args: any) => Promise<ProductBundleItem>;
    delete: (args: any) => Promise<ProductBundleItem>;
    deleteMany: (args: any) => Promise<{ count: number }>;
  };
}
