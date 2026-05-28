/**
 * RegLayer — Client Instrumentation (Sentry)
 *
 * WHY: Client-side errors (React crashes, unhandled promises) need reporting.
 * WHAT: Initializes Sentry SDK for browser with DSN, replay integration, error boundaries.
 * HOW: Next.js loads this in the browser bundle. Captures errors + session replays for debugging.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adds request headers and IP for users
  sendDefaultPii: true,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,
});

// Instrument router navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
