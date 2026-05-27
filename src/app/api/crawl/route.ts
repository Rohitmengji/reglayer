import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { crawlSite } from "@/lib/scanner/crawler/siteCrawler";
import { getPlanContext } from "@/lib/credits/plan-context";
import { validateScanUrl } from "@/lib/validations/ssrf";

const crawlSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(50).default(10),
  maxDepth: z.number().min(1).max(5).default(3),
  concurrency: z.number().min(1).max(3).default(2),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = crawlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { url, maxDepth, concurrency, includePatterns, excludePatterns } = parsed.data;
  let { maxPages } = parsed.data;

  // SSRF protection
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }

  // Enforce page limit based on plan
  const planCtx = await getPlanContext();
  if (planCtx && !planCtx.isMasterAdmin) {
    const pageLimit = planCtx.limits.pagesPerScan;
    if (pageLimit !== -1 && maxPages > pageLimit) {
      maxPages = pageLimit;
    }
  }

  try {
    const result = await crawlSite({
      startUrl: url,
      maxPages,
      maxDepth,
      concurrency,
      includePatterns,
      excludePatterns,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Crawl failed", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
