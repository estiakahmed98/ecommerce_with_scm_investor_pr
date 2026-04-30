import { NextResponse } from "next/server";

const SITE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export async function GET() {
  let blogs = [];
  
  try {
    const res = await fetch(`${SITE_URL}/api/blog`, {
      next: { revalidate: 3600 },
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch blogs: ${res.status}`);
    }
    
    const data = await res.json();
    // Ensure we always have an array, even if API returns object or null
    blogs = Array.isArray(data) ? data : (data?.blogs || []);
  } catch (error) {
    console.error('Error fetching blogs for sitemap:', error);
    // Return empty sitemap instead of failing the build
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      </urlset>`,
      {
        headers: {
          'Content-Type': 'application/xml',
        },
      }
    );
  }

  const urls = blogs
    .filter((blog: any) => blog?.id) // Ensure blog has an id
    .map(
      (blog: any) => `
      <url>
        <loc>${SITE_URL}/ecommerce/blogs/${blog.id}</loc>
        <lastmod>${blog.updatedAt ? new Date(blog.updatedAt).toISOString() : new Date().toISOString()}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
      </url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
  </urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
