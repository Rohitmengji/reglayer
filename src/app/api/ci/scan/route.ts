/**
 * RegLayer — CI/CD Accessibility Gate API
 *
 * POST /api/ci/scan — Scan a URL and return pass/fail verdict in one call.
 *
 * Designed for GitHub Actions, GitLab CI, and any CI/CD pipeline.
 * Authenticates via API key, runs scan, evaluates guard policies, returns result.
 * The caller blocks until the scan completes (up to 90s).
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth/api-key";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { evaluateGuard } from "@/lib/guard/guardEngine";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";
import { z } from "zod";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().url(),
  failOnScore: z.number().min(0).max(100).optional(),
  failOnCritical: z.number().int().min(0).optional(),
  failOnSerious: z.number().int().min(0).optional(),
  failOnNew: z.number().int().min(0).optional(),
  usePolicies: z.boolean().optional().default(true),
  annotations: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  const log = logger.withContext({ route: "POST /api/ci/scan" });

  // 1. Authenticate via API key
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authorization required. Use: Authorization: Bearer <api-key>" },
      { status: 401 }
    );
  }

  const key = await authenticateApiKey(authHeader);
  if (!key) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 });
  }

  // 2. Parse and validate input
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { url, failOnScore, failOnCritical, failOnSerious, failOnNew, usePolicies, annotations } = parsed.data;

  log.info("CI scan initiated", { url, workspaceId: key.workspaceId });

  // 3. Run the scan
  let scanResult;
  try {
    scanResult = await executeScanPipeline(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    log.error("CI scan failed", { url, error: message });
    return NextResponse.json({ error: message, passed: false }, { status: 500 });
  }

  if (scanResult.status !== "completed") {
    return NextResponse.json(
      { error: `Scan status: ${scanResult.status}`, passed: false },
      { status: 500 }
    );
  }

  // 4. Persist the scan record
  const workspaceId = key.workspaceId;
  let scanId: string | null = null;
  try {
    const violations = scanResult.violations || [];
    const scan = await prisma.scan.create({
      data: {
        id: scanResult.id,
        url,
        status: "COMPLETED",
        score: scanResult.summary.score,
        totalViolations: scanResult.summary.totalViolations,
        critical: scanResult.summary.critical,
        serious: scanResult.summary.serious,
        moderate: scanResult.summary.moderate,
        minor: scanResult.summary.minor,
        pageTitle: scanResult.metadata?.pageTitle ? String(scanResult.metadata.pageTitle) : null,
        duration: scanResult.metadata?.scanDuration ?? null,
        completedAt: new Date(),
        workspaceId,
      },
    });
    scanId = scan.id;

    // Persist violations
    if (violations.length > 0) {
      await prisma.violation.createMany({
        data: violations.map((v) => ({
          ruleId: v.id,
          impact: v.impact as "critical" | "serious" | "moderate" | "minor",
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl || null,
          tags: v.wcagTags || [],
          affectedElements: JSON.parse(JSON.stringify(v.nodes)),
          scanId: scan.id,
        })),
      });
    }
  } catch (err) {
    log.error("CI scan: failed to persist", { url, error: String(err) });
    // Non-fatal — continue with the verdict
  }

  // 5. Evaluate pass/fail
  let passed = true;
  const failures: string[] = [];
  const score = scanResult.summary.score;
  const { critical, serious, totalViolations } = scanResult.summary;

  // Inline thresholds
  if (failOnScore !== undefined && score < failOnScore) {
    passed = false;
    failures.push(`Score ${score} is below threshold ${failOnScore}`);
  }
  if (failOnCritical !== undefined && critical > failOnCritical) {
    passed = false;
    failures.push(`${critical} critical violations exceeds max ${failOnCritical}`);
  }
  if (failOnSerious !== undefined && serious > failOnSerious) {
    passed = false;
    failures.push(`${serious} serious violations exceeds max ${failOnSerious}`);
  }

  // Guard policies
  let policyVerdicts: Array<{ name: string; passed: boolean; reason?: string }> = [];
  if (usePolicies && scanId) {
    // Find site by URL
    const site = await prisma.site.findFirst({
      where: { workspaceId, url },
    });
    if (site) {
      const verdicts = await evaluateGuard(scanId, site.id, workspaceId);
      policyVerdicts = verdicts.map((v) => ({ name: v.policyName, passed: v.passed, reason: v.summary }));
      const failed = verdicts.filter((v) => !v.passed);
      if (failed.length > 0) {
        passed = false;
        for (const f of failed) {
          failures.push(`Policy "${f.policyName}" failed: ${f.summary || "threshold exceeded"}`);
        }
      }
    }
  }

  // 6. Build annotations (for GitHub Actions)
  const githubAnnotations = annotations
    ? scanResult.violations.slice(0, 10).map((v) => ({
        level: v.impact === "critical" || v.impact === "serious" ? "error" : "warning",
        message: `[${v.id}] ${v.help} (${v.impact})`,
        title: `Accessibility: ${v.id}`,
      }))
    : [];

  log.info("CI scan complete", {
    url,
    score,
    violations: totalViolations,
    passed,
    failures: failures.length,
  });

  return NextResponse.json({
    passed,
    score,
    violations: {
      total: totalViolations,
      critical,
      serious,
      moderate: scanResult.summary.moderate,
      minor: scanResult.summary.minor,
    },
    failures,
    policies: policyVerdicts,
    annotations: githubAnnotations,
    scanId,
    reportUrl: scanId ? `/report/${scanId}` : null,
  });
}
