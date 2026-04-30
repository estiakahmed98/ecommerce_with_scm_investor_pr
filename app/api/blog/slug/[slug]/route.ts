import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET single blog by slug - Public access
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    const blog = await prisma.blog.findUnique({
      where: { slug: slug },
    });

    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    return NextResponse.json(blog);
  } catch (error) {
    console.error("Error fetching blog by slug:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
