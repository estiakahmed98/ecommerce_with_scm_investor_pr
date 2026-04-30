import { NextRequest, NextResponse } from "next/server";
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
  status: string;
  sentAt: Date | null;
}) {
  return {
    id: newsletter.id,
    title: newsletter.title,
    subject: newsletter.subject,
    contentLength: newsletter.content.length,
    status: newsletter.status,
    sentAt: newsletter.sentAt?.toISOString() ?? null,
  };
}

// GET /api/newsletter/[id] - Get specific newsletter
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const newsletter = await prisma.newsletter.findUnique({
      where: { id },
    });

    if (!newsletter) {
      return NextResponse.json(
        { error: "Newsletter not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(newsletter);
  } catch (error) {
    console.error("Error fetching newsletter:", error);
    return NextResponse.json(
      { error: "Failed to fetch newsletter" },
      { status: 500 }
    );
  }
}

// PUT /api/newsletter/[id] - Update newsletter
export async function PUT(
  request: NextRequest,
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
    if (!access.has("newsletter.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { title, subject, content } = await request.json();

    if (!title || !subject || !content) {
      return NextResponse.json(
        { error: "Title, subject, and content are required" },
        { status: 400 }
      );
    }

    // Check if newsletter exists and is not sent
    const existingNewsletter = await prisma.newsletter.findUnique({
      where: { id },
    });

    if (!existingNewsletter) {
      return NextResponse.json(
        { error: "Newsletter not found" },
        { status: 404 }
      );
    }

    if (existingNewsletter.status === "sent") {
      return NextResponse.json(
        { error: "Cannot update a sent newsletter" },
        { status: 400 }
      );
    }

    const updatedNewsletter = await prisma.newsletter.update({
      where: { id },
      data: {
        title,
        subject,
        content,
        updatedAt: new Date(),
      },
    });

    await logActivity({
      action: "update_newsletter",
      entity: "newsletter",
      entityId: updatedNewsletter.id,
      access,
      request,
      metadata: {
        message: `Newsletter updated: ${updatedNewsletter.title}`,
      },
      before: toNewsletterLogSnapshot(existingNewsletter),
      after: toNewsletterLogSnapshot(updatedNewsletter),
    });

    return NextResponse.json(updatedNewsletter);
  } catch (error) {
    console.error("Error updating newsletter:", error);
    return NextResponse.json(
      { error: "Failed to update newsletter" },
      { status: 500 }
    );
  }
}

// DELETE /api/newsletter/[id] - Delete newsletter
export async function DELETE(
  request: NextRequest,
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
    if (!access.has("newsletter.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    // Check if newsletter exists
    const existingNewsletter = await prisma.newsletter.findUnique({
      where: { id },
    });

    if (!existingNewsletter) {
      return NextResponse.json(
        { error: "Newsletter not found" },
        { status: 404 }
      );
    }

    if (existingNewsletter.status === "sent") {
      return NextResponse.json(
        { error: "Cannot delete a sent newsletter" },
        { status: 400 }
      );
    }

    await prisma.newsletter.delete({
      where: { id },
    });

    await logActivity({
      action: "delete_newsletter",
      entity: "newsletter",
      entityId: existingNewsletter.id,
      access,
      request,
      metadata: {
        message: `Newsletter deleted: ${existingNewsletter.title}`,
      },
      before: toNewsletterLogSnapshot(existingNewsletter),
    });

    return NextResponse.json({ message: "Newsletter deleted successfully" });
  } catch (error) {
    console.error("Error deleting newsletter:", error);
    return NextResponse.json(
      { error: "Failed to delete newsletter" },
      { status: 500 }
    );
  }
}
