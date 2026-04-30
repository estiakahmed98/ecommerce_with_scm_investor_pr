import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/supplier/",
          "/dashboard/",
          "/auth/",
          "/login/",
          "/register/",
          "/api/admin/",
          "/api/supplier/",
          "/api/auth",
          "/api/cart",
          "/api/user",
          "/private/",
          "/ecommerce/user/",
          "/track/",
          "/print/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
