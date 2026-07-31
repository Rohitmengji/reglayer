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

const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

function createPrismaClient() {
  // Bound the per-instance pool. Each serverless instance opens its own pool, so
  // the pg default (max 10) multiplies across concurrent instances and exhausts
  // Postgres. A small cap + short idle timeout keeps connection use conservative;
  // for real scale the DATABASE_URL must point at a pooled endpoint (Neon -pooler).
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: IS_SERVERLESS ? 5 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
