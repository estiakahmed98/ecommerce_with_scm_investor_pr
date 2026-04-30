import { NextResponse } from "next/server";

export async function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  let authors: any[] = [];
  try {
    const res = await fetch(`${siteUrl}/api/writers`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Failed to fetch writers: ${res.status}`);
    const data = await res.json();
    authors = Array.isArray(data) ? data : (data?.authors || data?.writers || []);
  } catch (error) {
    console.error("Error fetching writers for sitemap:", error);
    authors = [];
  }

  const urls = authors
    .map(
      (author: any) => `
      <url>
        <loc>${siteUrl}/ecommerce/authors/${author.id}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
      </url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
  </urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
