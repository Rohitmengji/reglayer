/**
 * RegLayer — Server Instrumentation (Sentry)
 *
 * WHY: Server-side errors (API routes, SSR) need to be captured and reported to Sentry.
 * WHAT: Initializes Sentry SDK for Node.js runtime with DSN, traces sample rate, environment.
 * HOW: Next.js calls this file on server startup. Exported register() function inits Sentry.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Warm up DB connection pool on server start to avoid cold-start latency
    // on the first user request. Neon serverless can take 3-5s on cold start.
    if (process.env.DATABASE_URL) {
      import("@/lib/database/prisma").then(({ prisma }) => {
        prisma.$executeRawUnsafe("SELECT 1").catch(() => {
          // Non-fatal: warmup failure just means first request will be slow
        });
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors from Server Components, middleware, and proxies
export const onRequestError = Sentry.captureRequestError;
