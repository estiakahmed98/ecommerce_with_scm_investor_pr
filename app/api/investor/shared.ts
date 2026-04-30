//app/api/investor/shared.ts
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { resolveInvestorPortalContext } from "@/lib/investor-portal";

export async function resolveInvestorRequestContext() {
  const session = await getServerSession(authOptions);
  return resolveInvestorPortalContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
}

export function decimalToString(value: Prisma.Decimal | null | undefined) {
  return (value ?? new Prisma.Decimal(0)).toString();
}

export function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}
