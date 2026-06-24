/**
 * ---------------------------------------------------------
 * RegLayer — Next.js Configuration
 * ---------------------------------------------------------
 *
 * WHY: Configures the Next.js 16 build system and Sentry integration.
 *
 * WHAT:
 * - Marks heavy server packages (chromium, playwright, pg) as external
 *   so they don't bloat client bundles or cause bundling errors.
 * - Includes Chromium binaries in Vercel deployment via outputFileTracingIncludes.
 * - Enables Turbopack (Next.js 16 default bundler).
 * - Optimizes barrel imports (lucide-react, etc.) for faster builds.
 * - Wraps config with Sentry for error tracking + source maps.
 *
 * HOW:
 * - serverExternalPackages: tells bundler "don't try to bundle these"
 * - outputFileTracingIncludes: ensures @sparticuz/chromium binary deploys to serverless
 * - withSentryConfig: wraps Next config to add Sentry webpack plugin
 * - tunnelRoute: proxies Sentry requests through our server to avoid ad-blockers
 * ---------------------------------------------------------
 */

import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // @boxyhq/saml-jackson (embedded SSO) pulls typeorm + dynamic driver requires
  // that must NOT be bundled — externalize so the server build resolves them at runtime.
  serverExternalPackages: ["@sparticuz/chromium", "playwright", "puppeteer-core", "pg", "@boxyhq/saml-jackson"],
  outputFileTracingIncludes: {
    "/api/scan": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/scan/crawl": ["./node_modules/@sparticuz/chromium/bin/**"],
    // Journey + screen-reader also launch a headless browser; without the
    // bundled Chromium binary both features failed in production.
    "/api/journey": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/screen-reader": ["./node_modules/@sparticuz/chromium/bin/**"],
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
