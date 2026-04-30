import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSlug } from "@/lib/utils";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

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

// GET single blog by ID - Public access (for backward compatibility)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const blogId = Number(id);
    if (!Number.isInteger(blogId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const blog = await prisma.blog.findUnique({
      where: { id: blogId },
    });

    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    return NextResponse.json(blog);
  } catch (error) {
    console.error("Error fetching blog by ID:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// UPDATE blog - Admin only
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("blogs.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const blogId = Number(id);
    if (!Number.isInteger(blogId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existingBlog = await prisma.blog.findUnique({
      where: { id: blogId },
    });
    if (!existingBlog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    // Only allow fields in your schema
    const {
      title,
      summary,
      date,
      author,
      image,
      ads,
    }: {
      title?: string;
      summary?: string;
      date?: string;
      author?: string;
      image?: string;
      ads?: string | null;
    } = await req.json();

    // Generate new slug if title is being updated
    const updateData: {
      title?: string;
      slug?: string;
      summary: string;
      date: Date;
      author: string;
      image: string;
      ads: string | null;
    } = {
      summary:
        typeof summary === "string" && summary.trim().length > 0
          ? summary
          : existingBlog.summary,
      date: date ? new Date(date) : existingBlog.date,
      author: author ?? existingBlog.author,
      image: image ?? existingBlog.image,
      ads:
        typeof ads === "string" && ads.trim().length > 0
          ? ads.trim()
          : existingBlog.ads,
    };

    if (title && title !== existingBlog.title) {
      let newSlug = generateSlug(title);
      
      // Check if new slug already exists (excluding current blog)
      const existingSlug = await prisma.blog.findFirst({ 
        where: { 
          slug: newSlug,
          id: { not: blogId }
        }
      });
      
      if (existingSlug) {
        let counter = 1;
        let uniqueSlug = `${newSlug}-${counter}`;
        while (await prisma.blog.findFirst({ 
          where: { 
            slug: uniqueSlug,
            id: { not: blogId }
          }
        })) {
          counter++;
          uniqueSlug = `${newSlug}-${counter}`;
        }
        newSlug = uniqueSlug;
      }
      
      updateData.title = title;
      updateData.slug = newSlug;
    }

    const updated = await prisma.blog.update({
      where: { id: blogId },
      data: updateData,
    });

    await logActivity({
      action: "update",
      entity: "blog",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: `Blog updated: ${updated.title}`,
      },
      before: toBlogLogSnapshot(existingBlog),
      after: toBlogLogSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating blog:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE blog - Admin only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("blogs.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const blogId = Number(id);
    if (!Number.isInteger(blogId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.blog.findUnique({
      where: { id: blogId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    await prisma.blog.delete({ where: { id: blogId } });

    await logActivity({
      action: "delete",
      entity: "blog",
      entityId: blogId,
      access,
      request: req,
      metadata: {
        message: `Blog deleted: ${existing.title}`,
      },
      before: toBlogLogSnapshot(existing),
    });

    return NextResponse.json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
