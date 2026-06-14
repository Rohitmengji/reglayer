/**
 * RegLayer — Environment Variable Validation
 *
 * WHY: Missing env vars cause cryptic runtime errors — fail fast at startup instead.
 * WHAT: Validates all required env vars (DATABASE_URL, NEXTAUTH_SECRET, etc.) exist at build/start.
 * HOW: Uses zod schema to parse process.env. Throws descriptive error listing missing vars.
 */
import "server-only";

import { z } from "zod/v4";

/**
 * Environment validation schema.
 * Validates all required env vars at import time.
 * If any are missing, the app crashes immediately with a clear error
 * instead of failing silently at runtime.
 */
const envSchema = z.object({
  // ── Required ──────────────────────────────────────────────
  // Missing any of these is fatal — the app cannot function without them.
  DATABASE_URL: z.url("DATABASE_URL must be a valid PostgreSQL URL"),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters"),
  NEXTAUTH_URL: z.url("NEXTAUTH_URL must be a valid URL"),

  // ── Optional (graceful degradation) ───────────────────────
  // These back optional services. Their absence must NOT crash boot — the app
  // disables the corresponding feature instead. Hence every one is .optional().

  // OpenAI (AI fix suggestions / remediation)
  OPENAI_API_KEY: z.string().optional(),

  // SMTP (transactional email) — names match the code's process.env usage
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Stripe (billing)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_ANNUAL: z.string().optional(),

  // Encryption (integration secrets at rest)
  ENCRYPTION_KEY: z.string().optional(),

  // Cron (scheduled scans trigger auth)
  CRON_SECRET: z.string().optional(),

  // Upstash Redis (cache layer)
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().optional(),

  // Public app URL (links in emails / reports)
  NEXT_PUBLIC_APP_URL: z.string().optional(),

  // Seed accounts (optional — only for dev)
  SEED_MASTER_EMAIL: z.email().optional(),
  SEED_MASTER_PASSWORD: z.string().optional(),
  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `\n\n❌ Environment validation failed:\n${formatted}\n\nFix your .env.local or deployment environment.\n`
    );
  }

  return result.data;
}

/**
 * Validated environment variables.
 * Import this instead of using process.env directly.
 */
export const env = validateEnv();
