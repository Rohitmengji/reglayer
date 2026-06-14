/**
 * RegLayer — CI/CD Quality Gate API
 *
 * WHY: Teams want to block deployments if accessibility score drops below threshold.
 * WHAT: POST with URL + threshold, returns pass/fail status for CI/CD integration.
 * HOW: Runs a scan, compares score against threshold. Returns { passed: boolean, score, threshold }.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { z } from "zod";

/**
 * CI/CD Gate API
 * 
 * POST /api/gate
 * 
 * Runs a scan and returns pass/fail based on threshold.
 * Designed for CI pipelines (GitHub Actions, GitLab CI, etc.)
 * 
 * Request:
 *   { "url": "https://...", "threshold": 80 }
 * 
 * Response:
 *   { "passed": true/false, "score": 85, "scanId": "...", ... }
 * 
 * Exit codes in CI:
 *   curl ... | jq '.passed' → true/false
 */

const gateSchema = z.object({
  url: z.string().url(),
  threshold: z.number().min(0).max(100).default(80),
  failOn: z.enum(["score", "critical", "serious"]).default("score"),
  maxCritical: z.number().min(0).default(0),
  maxSerious: z.number().min(0).default(3),
});

export async function POST(request: NextRequest) {
  // API key authentication
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.replace("Bearer ", "")) {
    return NextResponse.json(
      { error: "Authorization required. Use: Authorization: Bearer <api-key>" },
      { status: 401 }
    );
  }

  const key = await authenticateApiKey(authHeader);
  if (!key) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  // Update last used timestamp
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {/* non-critical */});

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = gateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { url, threshold, failOn, maxCritical, maxSerious } = parsed.data;

  // SSRF protection
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError, passed: false }, { status: 400 });
  }

  // Scope this scan to the key's workspace/owner so the scan (and the billing it
  // accrues) is attributed to the correct tenant rather than persisted orphaned.
  let ownerEmail: string | undefined;
  if (key.userId) {
    const owner = await prisma.user.findUnique({
      where: { id: key.userId },
      select: { email: true },
    });
    ownerEmail = owner?.email;
  }

  // Trigger scan via internal service
  const { performScan } = await import("@/services/scanService");

  try {
    const result = await performScan({ url, userEmail: ownerEmail });

    const score = result.scan.summary.score;
    const critical = result.scan.summary.critical;
    const serious = result.scan.summary.serious;

    let passed = true;
    let reason = "";

    if (failOn === "score" && score < threshold) {
      passed = false;
      reason = `Score ${score} is below threshold ${threshold}`;
    } else if (failOn === "critical" && critical > maxCritical) {
      passed = false;
      reason = `${critical} critical violations exceeds max ${maxCritical}`;
    } else if (failOn === "serious" && serious > maxSerious) {
      passed = false;
      reason = `${serious} serious violations exceeds max ${maxSerious}`;
    }

    return NextResponse.json({
      passed,
      reason: passed ? "All checks passed" : reason,
      score,
      threshold,
      scanId: result.scan.id,
      url,
      violations: {
        total: result.scan.summary.totalViolations,
        critical,
        serious,
        moderate: result.scan.summary.moderate,
        minor: result.scan.summary.minor,
      },
      compliance: result.compliance.overallCompliance,
      timestamp: new Date().toISOString(),
      reportUrl: `${request.nextUrl.origin}/report/${result.scan.id}`,
      badgeUrl: `${request.nextUrl.origin}/api/badge?url=${encodeURIComponent(url)}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        passed: false,
        reason: "Scan failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
