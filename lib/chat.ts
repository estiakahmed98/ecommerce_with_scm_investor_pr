import type { ChatConversation } from "@/generated/prisma";

type SessionUser = {
  id?: string;
  role?: string;
} | null | undefined;

type ConversationAccessShape = Pick<ChatConversation, "userId" | "guestEmail">;

export type ChatActor = {
  userId: string | null;
  role: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  senderRole: "admin" | "user" | "guest";
};

export function normalizeGuestEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 3 ? normalized : null;
}

export function getChatActor(
  sessionUser: SessionUser,
  options?: { canManageChats?: boolean },
): ChatActor {
  const userId = typeof sessionUser?.id === "string" ? sessionUser.id : null;
  const role = typeof sessionUser?.role === "string" ? sessionUser.role : null;
  const isAdmin =
    options?.canManageChats ?? (role?.toLowerCase() === "admin");

  return {
    userId,
    role,
    isAdmin,
    isAuthenticated: Boolean(userId),
    senderRole: isAdmin ? "admin" : userId ? "user" : "guest",
  };
}

export function canAccessConversation(
  conversation: ConversationAccessShape,
  actor: ChatActor,
  guestEmail: string | null,
): boolean {
  if (actor.isAdmin) return true;
  if (actor.userId) return conversation.userId === actor.userId;
  if (!guestEmail || !conversation.guestEmail) return false;
  return conversation.guestEmail.toLowerCase() === guestEmail.toLowerCase();
}
