import "server-only";

import { z } from "zod/v4";

/**
 * Environment validation schema.
 * Validates all required env vars at import time.
 * If any are missing, the app crashes immediately with a clear error
 * instead of failing silently at runtime.
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.url("DATABASE_URL must be a valid PostgreSQL URL"),

  // Authentication
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters"),
  NEXTAUTH_URL: z.url("NEXTAUTH_URL must be a valid URL"),

  // OpenAI (optional — graceful degradation)
  OPENAI_API_KEY: z.string().optional(),

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
