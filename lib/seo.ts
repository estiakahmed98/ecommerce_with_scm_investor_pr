import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

type SiteSettingsSeo = {
  siteTitle: string;
  siteDescription: string;
  logo: string;
  contactEmail: string | null;
  contactNumber: string | null;
  address: string | null;
};

const DEFAULT_SITE_TITLE = "Universal Ecommerce";
const DEFAULT_SITE_DESCRIPTION =
  "Shop products online with fast delivery, verified inventory, and secure checkout.";
const DEFAULT_SITE_LOGO = "/assets/favicon.png";

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function toAbsoluteUrl(path?: string | null) {
  const siteUrl = getSiteUrl();

  if (!path) return siteUrl;
  if (/^https?:\/\//i.test(path)) return path;

  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function stripHtml(html?: string | null) {
  if (!html) return "";

  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, " ")
    .replace(/<script[^>]*>.*?<\/script>/gis, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(text: string, maxLength = 160) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const shortened = normalized.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}...`;
}

export async function getSiteSettingsForSeo(): Promise<SiteSettingsSeo> {
  try {
    const settings = await prisma.sitesettings.findFirst({
      orderBy: { id: "asc" },
      select: {
        siteTitle: true,
        footerDescription: true,
        logo: true,
        contactEmail: true,
        contactNumber: true,
        address: true,
      },
    });

    return {
      siteTitle: settings?.siteTitle?.trim() || DEFAULT_SITE_TITLE,
      siteDescription:
        settings?.footerDescription?.trim() || DEFAULT_SITE_DESCRIPTION,
      logo: settings?.logo || DEFAULT_SITE_LOGO,
      contactEmail: settings?.contactEmail || null,
      contactNumber: settings?.contactNumber || null,
      address: settings?.address || null,
    };
  } catch {
    return {
      siteTitle: DEFAULT_SITE_TITLE,
      siteDescription: DEFAULT_SITE_DESCRIPTION,
      logo: DEFAULT_SITE_LOGO,
      contactEmail: null,
      contactNumber: null,
      address: null,
    };
  }
}

export async function buildDefaultMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const settings = await getSiteSettingsForSeo();
  const logoUrl = toAbsoluteUrl(settings.logo);

  return {
    metadataBase: new URL(siteUrl),
    applicationName: settings.siteTitle,
    title: {
      default: settings.siteTitle,
      template: `%s | ${settings.siteTitle}`,
    },
    description: settings.siteDescription,
    alternates: {
      canonical: siteUrl,
    },
    keywords: [
      settings.siteTitle,
      "ecommerce",
      "online shopping",
      "products",
      "secure checkout",
      "Bangladesh ecommerce",
    ],
    authors: [{ name: settings.siteTitle }],
    creator: settings.siteTitle,
    publisher: settings.siteTitle,
    category: "shopping",
    icons: {
      icon: settings.logo,
      shortcut: settings.logo,
      apple: settings.logo,
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      type: "website",
      url: siteUrl,
      siteName: settings.siteTitle,
      title: settings.siteTitle,
      description: settings.siteDescription,
      images: [
        {
          url: logoUrl,
          alt: settings.siteTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: settings.siteTitle,
      description: settings.siteDescription,
      images: [logoUrl],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export async function getOrganizationJsonLd() {
  const settings = await getSiteSettingsForSeo();
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}#organization`,
    name: settings.siteTitle,
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: toAbsoluteUrl(settings.logo),
    },
    email: settings.contactEmail || undefined,
    telephone: settings.contactNumber || undefined,
    address: settings.address || undefined,
  };
}
