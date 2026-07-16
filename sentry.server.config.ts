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

  // Performance monitoring — 20% of requests in production
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.2,

  // Profiling — captures CPU/memory flamegraphs on 10% of traced requests.
  // This is the only way to diagnose slow API routes in production.
  profilesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,

  // Filter noise: don't send expected errors to Sentry
  beforeSend(event) {
    // 404s and auth redirects are expected, not errors
    const status = event.contexts?.response?.status_code;
    if (status === 404 || status === 401 || status === 429) return null;
    return event;
  },
});
