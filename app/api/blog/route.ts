import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateSlug } from '@/lib/utils';
import { getAccessContext } from '@/lib/rbac';
import { logActivity } from '@/lib/activity-log';

function toBlogLogSnapshot(blog: {
  title: string;
  slug: string;
  summary?: string | null;
  author: string;
  image?: string | null;
  ads?: string | null;
}) {
  return {
    title: blog.title,
    slug: blog.slug,
    summary: blog.summary ?? null,
    author: blog.author,
    image: blog.image ?? null,
    adsConfigured: Boolean(blog.ads),
  };
}

// GET all blogs - Public access
export async function GET(request: NextRequest) {
  try {

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    const where = search ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { author: { contains: search, mode: 'insensitive' as const } },
        { summary: { contains: search, mode: 'insensitive' as const } }
      ]
    } : {};

    const [blogs, total] = await Promise.all([
      prisma.blog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.blog.count({ where })
    ]);

    return NextResponse.json({
      blogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// CREATE new blog - Admin only
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.has('blogs.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { title, summary, content, date, author, image, ads } = body;

    if (!title || !date || !author) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    function cleanSummary(text: string, maxLength: number = 300) {
      if (!text) return "";

      const clean = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      if (clean.length <= maxLength) return clean;

      const sentences = clean.split(/(?<=[।!?])/).map(s => s.trim()).filter(Boolean);

        let final = "";
        for (const s of sentences) {
        if ((final + " " + s).trim().length <= maxLength) {
          final += (final ? " " : "") + s;
        } else break;
      }

      if (!final) {
        const cut = clean.substring(0, maxLength);
        return cut.substring(0, cut.lastIndexOf(" ")) + "...";
      }

      return final.trim();
    }

    const computedSummary =
      summary && summary.trim().length > 0
        ? summary.trim()
        : cleanSummary(content || "");

    // Generate unique slug
    let slug = generateSlug(title);
    
    // Check if slug already exists and make it unique
    const existingBlog = await prisma.blog.findUnique({ where: { slug } });
    if (existingBlog) {
      let counter = 1;
      let uniqueSlug = `${slug}-${counter}`;
      while (await prisma.blog.findUnique({ where: { slug: uniqueSlug } })) {
        counter++;
        uniqueSlug = `${slug}-${counter}`;
      }
      slug = uniqueSlug;
    }

    const blog = await prisma.blog.create({
      data: {
        slug,
        title,
        summary: computedSummary,
        content: content || '',
        date: new Date(date),
        author,
        image: image || '',
        ads: ads ?? null,
      }
    });

    await logActivity({
      action: "create",
      entity: "blog",
      entityId: blog.id,
      access,
      request,
      metadata: {
        message: `Blog created: ${blog.title}`,
      },
      after: toBlogLogSnapshot(blog),
    });

    return NextResponse.json(blog, { status: 201 });
  } catch (error) {
    console.error('Error creating blog:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
