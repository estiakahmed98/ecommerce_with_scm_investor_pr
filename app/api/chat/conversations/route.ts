import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma, type ChatPriority, type ChatStatus } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import { getChatActor, normalizeGuestEmail } from "@/lib/chat";
import { getAccessContext } from "@/lib/rbac";

const CHAT_STATUSES: ChatStatus[] = ["OPEN", "IN_PROGRESS", "CLOSED"];
const CHAT_PRIORITIES: ChatPriority[] = ["LOW", "NORMAL", "HIGH"];

function toCleanText(value: unknown, max = 1000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function composeMessage(
  message: string,
  quickAction: string,
  orderReference: string,
): string {
  const tags: string[] = [];
  if (quickAction) tags.push(`Topic: ${quickAction}`);
  if (orderReference) tags.push(`Order: ${orderReference}`);
  const prefix = tags.length > 0 ? `[${tags.join(" | ")}] ` : "";
  return `${prefix}${message}`.trim();
}

function formatChatActorName(actor: { userId: string | null; senderRole: string }, body: any) {
  if (actor.userId) return actor.userId;
  return normalizeGuestEmail(body.guestEmail) || toCleanText(body.guestName, 120) || "guest";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    const actor = getChatActor(
      session?.user as { id?: string; role?: string } | undefined,
      { canManageChats: access.has("chats.manage") },
    );
    const { searchParams } = new URL(request.url);

    const guestEmail = normalizeGuestEmail(searchParams.get("guestEmail"));
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assignedTo = searchParams.get("assignedTo");
    const search = toCleanText(searchParams.get("q"), 100);
    const limitRaw = Number(searchParams.get("limit") || "30");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;

    const where: Prisma.ChatConversationWhereInput = {};

    if (actor.isAdmin) {
      if (status && CHAT_STATUSES.includes(status as ChatStatus)) {
        where.status = status as ChatStatus;
      }
      if (priority && CHAT_PRIORITIES.includes(priority as ChatPriority)) {
        where.priority = priority as ChatPriority;
      }
      if (assignedTo === "me" && actor.userId) {
        where.assignedToId = actor.userId;
      } else if (assignedTo === "unassigned") {
        where.assignedToId = null;
      } else if (assignedTo && assignedTo !== "all") {
        where.assignedToId = assignedTo;
      }
      if (search) {
        where.OR = [
          { guestEmail: { contains: search, mode: "insensitive" } },
          { guestName: { contains: search, mode: "insensitive" } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          { user: { name: { contains: search, mode: "insensitive" } } },
        ];
      }
    } else if (actor.userId) {
      where.userId = actor.userId;
    } else if (guestEmail) {
      where.guestEmail = guestEmail;
    } else {
      return NextResponse.json(
        { error: "Guest email is required for unauthenticated access." },
        { status: 401 },
      );
    }

    const conversations = await prisma.chatConversation.findMany({
      where,
      take: limit,
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            message: true,
            createdAt: true,
            senderRole: true,
            isRead: true,
            attachmentUrl: true,
          },
        },
        _count: { select: { messages: true } },
      },
    });

    const payload = conversations.map((conversation) => ({
      ...conversation,
      lastMessage: conversation.messages[0] ?? null,
      messages: undefined,
    }));

    return NextResponse.json(payload);
  } catch (error) {
    console.error("CHAT CONVERSATIONS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load conversations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    const actor = getChatActor(
      session?.user as { id?: string; role?: string } | undefined,
      { canManageChats: access.has("chats.manage") },
    );
    const body = await request.json().catch(() => ({}));

    const guestEmail = normalizeGuestEmail(body.guestEmail);
    const guestName = toCleanText(body.guestName, 120);
    const message = toCleanText(body.message, 4000);
    const quickAction = toCleanText(body.quickAction, 80);
    const orderReference = toCleanText(body.orderReference, 60);
    const forceNew = Boolean(body.forceNew);

    if (!actor.userId && !guestEmail) {
      return NextResponse.json(
        { error: "Guest email is required to start a chat." },
        { status: 400 },
      );
    }

    if (!actor.userId && !guestName) {
      return NextResponse.json(
        { error: "Guest name is required to start a chat." },
        { status: 400 },
      );
    }

    let conversation = !forceNew
      ? await prisma.chatConversation.findFirst({
          where: actor.userId
            ? { userId: actor.userId, status: { in: ["OPEN", "IN_PROGRESS"] } }
            : { guestEmail: guestEmail!, status: { in: ["OPEN", "IN_PROGRESS"] } },
          orderBy: { updatedAt: "desc" },
        })
      : null;

    if (!conversation) {
      conversation = await prisma.chatConversation.create({
        data: {
          userId: actor.userId,
          guestEmail: actor.userId ? null : guestEmail,
          guestName: actor.userId ? null : guestName,
          status: "OPEN",
          priority: "NORMAL",
        },
      });

      await logActivity({
        action: "create_chat_conversation",
        entity: "chat",
        entityId: conversation.id,
        access,
        request,
        metadata: {
          message: actor.isAdmin
            ? `Chat conversation opened by admin ${formatChatActorName(actor, body)}`
            : `Chat conversation started by ${formatChatActorName(actor, body)}`,
          status: conversation.status,
          priority: conversation.priority,
        },
        after: {
          id: conversation.id,
          userId: conversation.userId,
          guestEmail: conversation.guestEmail,
          guestName: conversation.guestName,
          status: conversation.status,
          priority: conversation.priority,
        },
      });
    }

    const composed = composeMessage(message, quickAction, orderReference);
    if (composed.length > 0) {
      await prisma.$transaction([
        prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            senderId: actor.userId,
            senderRole: actor.senderRole,
            message: composed,
          },
        }),
        prisma.chatConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            closedAt: null,
            status: actor.isAdmin ? "IN_PROGRESS" : "OPEN",
          },
        }),
      ]);
    }

    const latest = await prisma.chatConversation.findUnique({
      where: { id: conversation.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(latest, { status: 201 });
  } catch (error) {
    console.error("CHAT CONVERSATIONS POST ERROR:", error);
    return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 });
  }
}
