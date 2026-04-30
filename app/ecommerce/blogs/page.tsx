import { Metadata } from "next";
import AllBlogs from "@/components/admin/blog/AllBlogs";

const siteUrl =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export const metadata: Metadata = {
  title: "সাম্প্রতিক ব্লগ পোস্ট - কিতাবঘর | হিলফুল ফুজুল",
  description:
    "কিতাবঘরের সর্বশেষ ব্লগ পোস্টসমূহ পড়ুন। ইসলামিক বই, আধ্যাত্মিক জ্ঞান, জীবনঘনিষ্ঠ আলোচনা ও সমসাময়িক ইসলামিক বিষয় নিয়ে নিয়মিত আপডেট।",
  keywords: [
    "ব্লগ",
    "কিতাবঘর",
    "ইসলামিক বই",
    "হিলফুল ফুজুল",
    "ইসলামী জ্ঞান",
    "আধ্যাত্মিক আলোচনা",
    "ইসলামিক ব্লগ",
    "ধর্মীয় লেখা",
  ],

  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/ecommerce/blogs",
    languages: {
      "bn-BD": "/ecommerce/blogs",
    },
  },

  authors: [{ name: "কিতাবঘর - হিলফুল ফুজুল" }],
  creator: "কিতাবঘর - হিলফুল ফুজুল",
  publisher: "কিতাবঘর - হিলফুল ফুজুল",

  openGraph: {
    title: "সাম্প্রতিক ব্লগ পোস্ট - কিতাবঘর",
    description:
      "ইসলামিক বই, আধ্যাত্মিক জ্ঞান এবং জীবনমুখী আলোচনা নিয়ে কিতাবঘরের সাম্প্রতিক ব্লগ পোস্টসমূহ।",
    url: `${siteUrl}/ecommerce/blogs`,
    siteName: "কিতাবঘর - হিলফুল ফুজুল",
    type: "website",
    locale: "bn_BD",
    images: [
      {
        url: `${siteUrl}/assets/favicon.png`,
        width: 1200,
        height: 630,
        alt: "কিতাবঘর ব্লগ - ইসলামিক বই ও জ্ঞানের সমাহার",
      },
    ],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  category: "Islamic Blog",
};

export default function BlogsPage() {
  return (
    <>
      {/* Blog Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            "@id": `${siteUrl}/ecommerce/blogs`,
            name: "কিতাবঘর ব্লগ",
            description:
              "ইসলামিক বই, আধ্যাত্মিক জ্ঞান ও জীবনমুখী আলোচনাসহ কিতাবঘরের সাম্প্রতিক ব্লগ পোস্টসমূহ।",
            url: `${siteUrl}/ecommerce/blogs`,
            inLanguage: "bn-BD",
            publisher: {
              "@type": "Organization",
              name: "কিতাবঘর - হিলফুল ফুজুল",
              url: siteUrl,
              logo: {
                "@type": "ImageObject",
                url: `${siteUrl}/assets/favicon.png`,
                width: 512,
                height: 512,
              },
            },
            author: {
              "@type": "Organization",
              name: "কিতাবঘর - হিলফুল ফুজুল",
            },
          }),
        }}
      />

      {/* Breadcrumb Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "হোম",
                item: siteUrl,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "কিতাবঘর",
                item: `${siteUrl}/`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: "ব্লগসমূহ",
                item: `${siteUrl}/ecommerce/blogs`,
              },
            ],
          }),
        }}
      />

      <div className="space-y-6">
        <AllBlogs />
      </div>
    </>
  );
}
