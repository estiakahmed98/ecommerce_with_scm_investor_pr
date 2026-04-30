// app/ecommerce/books/page.tsx
import { Metadata } from "next";
import ProductsPage from "./AllProducts";

const siteUrl =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export const metadata: Metadata = {
  title: "All Products - BOED E-COMMERCE",
  description:
    "Explore all products on BOED E-COMMERCE. Browse categories, compare prices, and shop your favorite items.",
  keywords: [
    "all products",
    "products",
    "BOED E-COMMERCE",
    "ecommerce",
    "online shop",
    "bangladesh ecommerce",
    "bdt products",
  ],

  metadataBase: new URL(siteUrl),

  alternates: {
    canonical: "/ecommerce/products",
    languages: {
      "en-US": "/ecommerce/products",
    },
  },

  openGraph: {
    title: "All Products - BOED E-COMMERCE",
    description:
      "Discover BOED E-COMMERCE’s full product collection—shop by category, compare prices, and find the best deals.",
    url: `${siteUrl}/ecommerce/products`,
    siteName: "BOED E-COMMERCE",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${siteUrl}/assets/favicon.png`,
        width: 1200,
        height: 630,
        alt: "Universal Ecommerce - All Products",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "All Products - BOED E-COMMERCE",
    description:
      "Browse BOED E-COMMERCE’s complete product collection—categories, pricing, and featured items.",
    images: [`${siteUrl}/assets/favicon.png`],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

export default function BooksPage() {
  return (
    <>
      {/* Schema.org: Products Collection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "All Products - BOED E-COMMERCE",
            url: `${siteUrl}/ecommerce/products`,
            description:
              "BOED E-COMMERCE all products collection—browse categories, compare prices, and shop confidently.",
            inLanguage: "en-US",
            breadcrumb: {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item: `${siteUrl}/`,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "BOED E-COMMERCE",
                  item: `${siteUrl}/`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: "All Products",
                  item: `${siteUrl}/ecommerce/products`,
                },
              ],
            },
            publisher: {
              "@type": "Organization",
              name: "BOED E-COMMERCE",
              url: `${siteUrl}/`,
              logo: {
                "@type": "ImageObject",
                url: `${siteUrl}/assets/favicon.png`,
                width: 512,
                height: 512,
              },
            },
          }),
        }}
      />

      <ProductsPage />
    </>
  );
}