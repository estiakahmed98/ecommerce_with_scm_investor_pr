import { getServerSession } from "next-auth/next";
import { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";

export async function ensurePayrollAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    return { access, error: "Unauthorized", status: 401 as const };
  }

  if (!access.has("payroll.manage")) {
    return { access, error: "Forbidden", status: 403 as const };
  }

  return { access };
}

export function toRequiredDecimal(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${field} is required`);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return new Prisma.Decimal(amount);
}

export function toOptionalDecimal(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return new Prisma.Decimal(amount);
}

export function toOptionalDate(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return date;
}

export function toOptionalInt(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return num;
}

export function toOptionalString(value: unknown) {
  if (value === null || value === undefined) return null;
  const next = String(value).trim();
  return next ? next : null;
}
