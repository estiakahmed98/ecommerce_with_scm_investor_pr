import { prisma } from "@/lib/prisma";
import {
  getSiteSettingsForSeo,
  getSiteUrl,
  stripHtml,
  toAbsoluteUrl,
  truncateText,
} from "@/lib/seo";

type ProductHeadProps = {
  params: Promise<{ id: string }>;
};

export default async function Head({ params }: ProductHeadProps) {
  const { id } = await params;
  const siteUrl = getSiteUrl();
  const settings = await getSiteSettingsForSeo();

  let product = null;

  try {
    product = Number.isFinite(Number(id))
      ? await prisma.product.findUnique({
          where: { id: Number(id) },
          include: {
            category: {
              select: { name: true },
            },
            brand: {
              select: { name: true },
            },
            writer: {
              select: { name: true },
            },
            publisher: {
              select: { name: true },
            },
          },
        })
      : null;
  } catch {
    product = null;
  }

  if (!product || product.deleted) {
    return (
      <>
        <title>Product Not Found | {settings.siteTitle}</title>
        <meta name="robots" content="noindex,nofollow" />
      </>
    );
  }

  const canonical = `${siteUrl}/ecommerce/products/${product.id}`;
  const title = `${product.name} | ${settings.siteTitle}`;
  const description = truncateText(
    stripHtml(product.shortDesc || product.description) ||
      `Buy ${product.name} online from ${settings.siteTitle}.`,
    160,
  );
  const image = product.image || settings.logo;
  const absoluteImage = toAbsoluteUrl(image);
  const price = Number(product.basePrice);
  const currency = product.currency || "BDT";
  const availability = product.available
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    name: product.name,
    description,
    image: [absoluteImage],
    sku: product.sku || undefined,
    brand: product.brand?.name
      ? {
          "@type": "Brand",
          name: product.brand.name,
        }
      : undefined,
    category: product.category?.name || undefined,
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: currency,
      price,
      availability,
      itemCondition: "https://schema.org/NewCondition",
    },
    aggregateRating:
      product.ratingCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          }
        : undefined,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Products",
        item: `${siteUrl}/ecommerce/products`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: canonical,
      },
    ],
  };

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta
        name="keywords"
        content={[
          product.name,
          product.category?.name,
          product.brand?.name,
          product.writer?.name,
          product.publisher?.name,
          settings.siteTitle,
        ]
          .filter(Boolean)
          .join(", ")}
      />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="product" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content={settings.siteTitle} />
      <meta property="og:image" content={absoluteImage} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
