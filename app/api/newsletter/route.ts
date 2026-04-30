import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { getAccessContext } from "@/lib/rbac";

function toNewsletterLogSnapshot(newsletter: {
  id: string;
  title: string;
  subject: string;
  content: string;
  status?: string;
  sentAt?: Date | null;
}) {
  return {
    id: newsletter.id,
    title: newsletter.title,
    subject: newsletter.subject,
    contentLength: newsletter.content.length,
    status: newsletter.status ?? "draft",
    sentAt: newsletter.sentAt?.toISOString() ?? null,
  };
}

// Get all newsletters
export async function GET() {
  try {
    const newsletters = await prisma.newsletter.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(newsletters);
  } catch (error) {
    console.error("GET newsletters error:", error);
    return NextResponse.json({ error: "Failed to fetch newsletters" }, { status: 500 });
  }
}

// Create newsletter
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("newsletter.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, subject, content } = await req.json();

    if (!title || !subject || !content) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const newsletter = await prisma.newsletter.create({
      data: {
        title,
        subject,
        content,
      },
    });

    await logActivity({
      action: "create_newsletter",
      entity: "newsletter",
      entityId: newsletter.id,
      access,
      request: req,
      metadata: {
        message: `Newsletter created: ${newsletter.title}`,
      },
      after: toNewsletterLogSnapshot(newsletter),
    });

    return NextResponse.json(newsletter, { status: 201 });
  } catch (error) {
    console.error("POST newsletter error:", error);
    return NextResponse.json({ error: "Failed to create newsletter" }, { status: 500 });
  }
}
