/**
 * RegLayer — Sentry Edge Config
 *
 * WHY: Edge runtime (middleware) needs separate Sentry init from Node.js runtime.
 * WHAT: Configures Sentry for Vercel Edge Functions (middleware.ts, edge API routes).
 * HOW: Lightweight Sentry init without Node.js-specific integrations. Same DSN, lower sample rate.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.2,

  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,
});
