/**
 * ---------------------------------------------------------
 * RegLayer — Multi-Page Scan API
 * ---------------------------------------------------------
 *
 * Purpose:
 * Crawls a site and scans multiple pages for accessibility.
 *
 * Flow:
 * 1. Crawl seed URL to discover pages
 * 2. Scan each discovered page
 * 3. Aggregate results into site-wide report
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { crawlPages } from "@/lib/scanner/browser/crawler";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { logger } from "@/lib/telemetry/logger";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { authConfigSchema } from "@/lib/validations/auth";
import type { ScanResult, ScanOptions } from "@/lib/types";

const crawlScanSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(500).default(10),
  excludePatterns: z.array(z.string()).optional(),
  auth: authConfigSchema.optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`crawl:${ip}`, RATE_LIMITS.crawl, "crawl");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before scanning again." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const apiLogger = logger.withContext({ route: "POST /api/scan/crawl" });

  try {
    const body = await request.json();
    const parseResult = crawlScanSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { url, maxPages, excludePatterns, auth } = parseResult.data;

    apiLogger.info("Multi-page scan initiated", { url, maxPages, authMethod: auth?.method });

    // Step 1: Crawl
    const crawlResult = await crawlPages(url, {
      maxPages,
      excludePatterns,
    });

    apiLogger.info("Crawl completed", {
      pagesFound: crawlResult.pages.length,
      totalDiscovered: crawlResult.totalDiscovered,
    });

    // Step 2: Scan each page
    const scanResults: ScanResult[] = [];
    const scanErrors: Array<{ url: string; error: string }> = [];
    const scanOptions: ScanOptions | undefined = auth && auth.method !== "none" ? { auth } : undefined;

    for (const pageUrl of crawlResult.pages) {
      try {
        const result = await executeScanPipeline(pageUrl, scanOptions);
        scanResults.push(result);
      } catch (err) {
        scanErrors.push({
          url: pageUrl,
          error: err instanceof Error ? err.message : "Scan failed",
        });
      }
    }

    // Step 3: Aggregate
    const totalViolations = scanResults.reduce(
      (sum, r) => sum + r.summary.totalViolations,
      0
    );
    const avgScore =
      scanResults.length > 0
        ? Math.round(
            scanResults.reduce((sum, r) => sum + r.summary.score, 0) /
              scanResults.length
          )
        : 0;

    return NextResponse.json({
      summary: {
        pagesScanned: scanResults.length,
        totalViolations,
        averageScore: avgScore,
        crawlErrors: crawlResult.errors.length,
        scanErrors: scanErrors.length,
      },
      pages: scanResults,
      errors: [...crawlResult.errors, ...scanErrors],
    });
  } catch (error) {
    apiLogger.error("Multi-page scan failed", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return NextResponse.json(
      { error: "Multi-page scan failed" },
      { status: 500 }
    );
  }
}
