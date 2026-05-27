import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  sendDefaultPii: true,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.2,

  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,
});
