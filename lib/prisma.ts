import { PrismaClient } from "@/generated/prisma";

declare global {
  // This will keep the Prisma client in memory for the duration of the server process
  let prisma: PrismaClient | undefined;
}

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

// Reuse the Prisma Client instance if it exists in the global object (for development)
export const prisma =
  globalForPrisma.prisma || new PrismaClient({ log: ["error", "warn"] });

// Store the Prisma Client instance in globalForPrisma for the duration of the application (for development)
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
