import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "playwright", "puppeteer-core", "pg"],
  outputFileTracingIncludes: {
    "/api/scan": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/scan/crawl": ["./node_modules/@sparticuz/chromium/bin/**"],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Optimize barrel file re-exports — transforms barrel imports into direct file imports
    // e.g. import { Scan } from "lucide-react" → import Scan from "lucide-react/dist/esm/icons/scan"
    optimizePackageImports: [
      "lucide-react",
      "@tanstack/react-query",
      "zod",
      "sonner",
    ],
  },

  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},
};

export default withSentryConfig(nextConfig, {
  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload source maps for readable stack traces
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Route Sentry requests through your server (avoids ad-blockers)
  tunnelRoute: "/sentry-tunnel",

  // Source maps config
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
});
