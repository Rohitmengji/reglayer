/**
 * RegLayer — Sentry Server Config
 *
 * WHY: Server-specific Sentry settings (tracing, profiling) differ from client.
 * WHAT: Configures server tracing (100% in dev, 10% in prod), sets environment/release tags.
 * HOW: Imported by instrumentation.ts. Sets sampleRate, integrations, beforeSend filters.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Adds request headers and IP for users
  sendDefaultPii: true,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.2,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,
});
