/**
 * RegLayer — Prisma Client Singleton
 *
 * WHY: PrismaClient creates a connection pool. Multiple instances would exhaust DB connections.
 * WHAT: Creates a single PrismaClient instance cached on globalThis.
 * HOW: Uses PrismaPg adapter for PostgreSQL. In dev, stored on globalThis to survive Hot Module Replacement.
 *      In prod, a single instance is created per cold start. `server-only` prevents client bundle inclusion.
 */

import "server-only";

// Validate environment at startup. prisma.ts is imported by virtually every
// server route, so importing this here runs validateEnv() once at boot and fails
// fast (only) on missing REQUIRED vars — optional services degrade gracefully.
import "@/lib/env";

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
