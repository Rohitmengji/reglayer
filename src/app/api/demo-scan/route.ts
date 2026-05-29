import { NextRequest, NextResponse } from "next/server";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

const demoSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

const DEMO_LIMIT = { limit: 10, windowSec: 3600 };

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Strict rate limit for unauthenticated demo scans
  const rl = await rateLimit(`demo:${ip}`, DEMO_LIMIT, "demo-scan");
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demo limit reached (10 free scans/hour). Sign up for more scans and full reports." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await request.json();
    const parsed = demoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid URL" },
        { status: 400 }
      );
    }

    const { url } = parsed.data;

    // SSRF protection
    const ssrfError = validateScanUrl(url);
    if (ssrfError) {
      return NextResponse.json({ error: ssrfError }, { status: 400 });
    }

    // Run a lightweight scan (no screenshot, no DB save)
    const result = await executeScanPipeline(url, { includeScreenshot: false });

    // Return only what the demo needs — teaser data
    const topViolations = result.violations.slice(0, 5).map((v) => ({
      id: v.id,
      description: v.description,
      impact: v.impact,
      count: v.nodes.length,
    }));

    return NextResponse.json({
      score: result.summary.score,
      url: result.url,
      totalViolations: result.summary.totalViolations,
      critical: result.summary.critical,
      serious: result.summary.serious,
      moderate: result.summary.moderate,
      minor: result.summary.minor,
      topViolations,
      pageTitle: result.metadata.pageTitle,
      scanDuration: result.metadata.scanDuration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
