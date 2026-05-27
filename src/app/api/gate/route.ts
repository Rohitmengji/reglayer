import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { createHash } from "crypto";
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
  const apiKey = authHeader?.replace("Bearer ", "");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Authorization required. Use: Authorization: Bearer <api-key>" },
      { status: 401 }
    );
  }

  // Validate API key — hash and compare against stored key hash
  const prefix = apiKey.substring(0, 8);
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const keyRecord = await prisma.apiKey.findFirst({
    where: { prefix, keyHash, expiresAt: { gt: new Date() } },
  });

  if (!keyRecord) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  // Update last used timestamp
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
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

  // Trigger scan via internal service
  const { performScan } = await import("@/services/scanService");
  
  try {
    const result = await performScan({ url });

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
