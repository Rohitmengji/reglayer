/**
 * POST /api/scan/multi-region — Run accessibility scans from multiple regions
 *
 * Executes the same scan against the same URL from different simulated geographic
 * locations in parallel. Returns a comparison of results across regions, surfacing
 * geo-specific accessibility differences (GDPR banners, localized content, CDN
 * variations, region-gated features).
 *
 * Feature-gated to PRO/Enterprise plans.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { requireFeature } from "@/lib/features/require-feature";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { SCAN_REGIONS, REGION_IDS, type RegionConfig } from "@/lib/scanner/regions";

export const maxDuration = 90;

const schema = z.object({
  url: z.string().url(),
  regions: z.array(z.string()).min(2).max(5).refine(
    (ids) => ids.every((id) => REGION_IDS.includes(id)),
    "Invalid region ID"
  ),
});

interface RegionResult {
  region: RegionConfig;
  score: number | null;
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  pageTitle: string | null;
  duration: number;
  uniqueViolationIds: string[];
  error?: string;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("scans.run");
  if (!perm.ok) return perm.response;

  // Multi-region is a premium feature
  const gate = await requireFeature("multiRegionScan");
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Multi-region scanning requires a PRO or Enterprise plan.", upgradeRequired: true },
      { status: 403 }
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`scan:multi:${ip}`, RATE_LIMITS.scan, "scan");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { url, regions } = parsed.data;
  const ssrfError = validateScanUrl(url);
  if (ssrfError) return NextResponse.json({ error: ssrfError }, { status: 400 });

  // Execute scans in parallel across regions
  const results = await Promise.allSettled(
    regions.map(async (regionId): Promise<RegionResult> => {
      const regionConfig = SCAN_REGIONS.find((r) => r.id === regionId)!;
      try {
        const result = await executeScanPipeline(url, { region: regionId });
        return {
          region: regionConfig,
          score: result.summary.score,
          totalViolations: result.summary.totalViolations,
          critical: result.summary.critical,
          serious: result.summary.serious,
          moderate: result.summary.moderate,
          minor: result.summary.minor,
          pageTitle: result.metadata.pageTitle || null,
          duration: result.metadata.scanDuration,
          uniqueViolationIds: result.violations.map((v) => v.id),
        };
      } catch (err) {
        return {
          region: regionConfig,
          score: null,
          totalViolations: 0,
          critical: 0,
          serious: 0,
          moderate: 0,
          minor: 0,
          pageTitle: null,
          duration: 0,
          uniqueViolationIds: [],
          error: err instanceof Error ? err.message : "Scan failed",
        };
      }
    })
  );

  const regionResults: RegionResult[] = results.map((r) =>
    r.status === "fulfilled" ? r.value : {
      region: { id: "unknown", name: "Unknown", flag: "❓", timezone: "", locale: "", acceptLanguage: "", geolocation: { latitude: 0, longitude: 0 } },
      score: null, totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0,
      pageTitle: null, duration: 0, uniqueViolationIds: [], error: "Scan execution failed",
    }
  );

  // Compute geo-diff: violations unique to specific regions
  const allViolationIds = new Set(regionResults.flatMap((r) => r.uniqueViolationIds));
  const universalViolations: string[] = [];
  const regionSpecific: Record<string, string[]> = {};

  for (const vid of allViolationIds) {
    const foundIn = regionResults.filter((r) => r.uniqueViolationIds.includes(vid)).map((r) => r.region.id);
    if (foundIn.length === regions.length) {
      universalViolations.push(vid);
    } else {
      for (const rid of foundIn) {
        if (!regionSpecific[rid]) regionSpecific[rid] = [];
        regionSpecific[rid].push(vid);
      }
    }
  }

  return NextResponse.json({
    url,
    regions: regionResults.map(({ region, score, totalViolations, critical, serious, moderate, minor, pageTitle, duration, error }) => ({
      id: region.id,
      name: region.name,
      flag: region.flag,
      score,
      totalViolations,
      critical,
      serious,
      moderate,
      minor,
      pageTitle,
      duration,
      error,
    })),
    comparison: {
      totalUniqueViolations: allViolationIds.size,
      universalViolations: universalViolations.length,
      regionSpecificViolations: Object.fromEntries(
        Object.entries(regionSpecific).map(([k, v]) => [k, v.length])
      ),
      scoreRange: {
        min: Math.min(...regionResults.filter((r) => r.score !== null).map((r) => r.score!)),
        max: Math.max(...regionResults.filter((r) => r.score !== null).map((r) => r.score!)),
        spread: regionResults.filter((r) => r.score !== null).length > 1
          ? Math.max(...regionResults.filter((r) => r.score !== null).map((r) => r.score!)) -
            Math.min(...regionResults.filter((r) => r.score !== null).map((r) => r.score!))
          : 0,
      },
    },
  });
}
