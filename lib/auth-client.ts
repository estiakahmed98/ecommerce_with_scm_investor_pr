export { signIn, signOut, useSession } from "next-auth/react";

type AccessUserLike = {
  role?: string;
  permissions?: string[];
} | null | undefined;

export function isAdmin(user?: AccessUserLike) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.includes("admin.panel.access");
}
