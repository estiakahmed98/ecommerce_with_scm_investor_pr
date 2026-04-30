import { prisma } from "@/lib/prisma";
import {
  getSiteSettingsForSeo,
  getSiteUrl,
  stripHtml,
  toAbsoluteUrl,
  truncateText,
} from "@/lib/seo";

type BlogHeadProps = {
  params: Promise<{ slug: string }>;
};

export default async function Head({ params }: BlogHeadProps) {
  const { slug } = await params;
  const siteUrl = getSiteUrl();
  const settings = await getSiteSettingsForSeo();

  let blog = null;

  try {
    blog = await prisma.blog.findUnique({
      where: { slug },
    });
  } catch {
    blog = null;
  }

  if (!blog) {
    return (
      <>
        <title>Blog Not Found | {settings.siteTitle}</title>
        <meta name="robots" content="noindex,nofollow" />
      </>
    );
  }

  const canonical = `${siteUrl}/ecommerce/blogs/${blog.slug}`;
  const title = `${blog.title} | ${settings.siteTitle}`;
  const description = truncateText(
    blog.summary || stripHtml(blog.content),
    160,
  );
  const absoluteImage = toAbsoluteUrl(blog.image || settings.logo);

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${canonical}#article`,
    headline: blog.title,
    description,
    image: [absoluteImage],
    datePublished: blog.date.toISOString(),
    dateModified: blog.updatedAt.toISOString(),
    author: {
      "@type": "Person",
      name: blog.author,
    },
    publisher: {
      "@type": "Organization",
      name: settings.siteTitle,
      logo: {
        "@type": "ImageObject",
        url: toAbsoluteUrl(settings.logo),
      },
    },
    mainEntityOfPage: canonical,
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
        name: "Blogs",
        item: `${siteUrl}/ecommerce/blogs`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: blog.title,
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
        content={[blog.title, blog.author, "blog", settings.siteTitle]
          .filter(Boolean)
          .join(", ")}
      />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="article" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:site_name" content={settings.siteTitle} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="article:published_time" content={blog.date.toISOString()} />
      <meta property="article:modified_time" content={blog.updatedAt.toISOString()} />
      <meta property="article:author" content={blog.author} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
