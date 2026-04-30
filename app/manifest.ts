import type { MetadataRoute } from "next";
import { getSiteSettingsForSeo, getSiteUrl } from "@/lib/seo";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const siteUrl = getSiteUrl();
  const settings = await getSiteSettingsForSeo();

  return {
    name: settings.siteTitle,
    short_name: settings.siteTitle.slice(0, 12),
    description: settings.siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: settings.logo,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    id: siteUrl,
  };
}
