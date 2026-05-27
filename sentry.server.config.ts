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
