/**
 * RegLayer — CI/CD Regression Guard Engine
 *
 * WHY: Simple thresholds miss gradual quality decay. Guard policies detect
 *      both absolute drops and cumulative regression over time.
 * WHAT: Policy engine that compares scans against locked baselines, detects drift,
 *       and produces pass/fail verdicts with detailed violation diffs.
 * HOW: Each site can have guard rules defining max allowed score drop,
 *       max new critical/serious violations, and auto-baseline promotion.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

export interface GuardPolicy {
  id: string;
  siteId: string;
  workspaceId: string;
  name: string;
  enabled: boolean;
  // Absolute thresholds
  minScore: number;
  maxCritical: number;
  maxSerious: number;
  // Regression tolerances (relative to baseline)
  maxScoreDrop: number;
  maxNewViolations: number;
  // Baseline management
  autoPromoteBaseline: boolean; // auto-update baseline on passing scans
  baselineScanId: string | null;
  baselineScore: number | null;
  baselineLockedAt: Date | null;
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface GuardVerdict {
  passed: boolean;
  policyId: string;
  policyName: string;
  siteUrl: string;
  currentScore: number;
  baselineScore: number | null;
  scoreDelta: number | null;
  checks: GuardCheck[];
  newViolations: Array<{ ruleId: string; impact: string; count: number }>;
  fixedViolations: Array<{ ruleId: string; impact: string; count: number }>;
  summary: string;
}

export interface GuardCheck {
  name: string;
  passed: boolean;
  actual: number;
  threshold: number;
  message: string;
}

/**
 * Evaluate a scan against all active guard policies for its site.
 */
export async function evaluateGuard(
  scanId: string,
  siteId: string,
  workspaceId: string
): Promise<GuardVerdict[]> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { violations: { select: { ruleId: true, impact: true } } },
  });

  if (!scan || scan.status !== "COMPLETED") {
    throw new Error("Scan must be completed to evaluate guard");
  }

  const policies = await prisma.guardPolicy.findMany({
    where: { siteId, workspaceId, enabled: true },
  });

  if (policies.length === 0) return [];

  const verdicts: GuardVerdict[] = [];

  for (const policy of policies) {
    const checks: GuardCheck[] = [];
    const score = scan.score ?? 0;

    // Check 1: Minimum score
    checks.push({
      name: "Minimum Score",
      passed: score >= policy.minScore,
      actual: score,
      threshold: policy.minScore,
      message: score >= policy.minScore
        ? `Score ${score.toFixed(0)} meets minimum ${policy.minScore}`
        : `Score ${score.toFixed(0)} below minimum ${policy.minScore}`,
    });

    // Check 2: Max critical violations
    checks.push({
      name: "Critical Violations",
      passed: scan.critical <= policy.maxCritical,
      actual: scan.critical,
      threshold: policy.maxCritical,
      message: scan.critical <= policy.maxCritical
        ? `${scan.critical} critical (max ${policy.maxCritical})`
        : `${scan.critical} critical exceeds max ${policy.maxCritical}`,
    });

    // Check 3: Max serious violations
    checks.push({
      name: "Serious Violations",
      passed: scan.serious <= policy.maxSerious,
      actual: scan.serious,
      threshold: policy.maxSerious,
      message: scan.serious <= policy.maxSerious
        ? `${scan.serious} serious (max ${policy.maxSerious})`
        : `${scan.serious} serious exceeds max ${policy.maxSerious}`,
    });

    // Regression checks (only if baseline exists)
    let scoreDelta: number | null = null;
    const newViolations: Array<{ ruleId: string; impact: string; count: number }> = [];
    const fixedViolations: Array<{ ruleId: string; impact: string; count: number }> = [];

    if (policy.baselineScanId) {
      const baselineScan = await prisma.scan.findUnique({
        where: { id: policy.baselineScanId },
        include: { violations: { select: { ruleId: true, impact: true } } },
      });

      if (baselineScan) {
        scoreDelta = score - (baselineScan.score ?? 0);

        // Check 4: Max score drop from baseline
        checks.push({
          name: "Score Regression",
          passed: scoreDelta >= -policy.maxScoreDrop,
          actual: Math.abs(Math.min(0, scoreDelta)),
          threshold: policy.maxScoreDrop,
          message: scoreDelta >= -policy.maxScoreDrop
            ? `Score delta ${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(1)} within tolerance`
            : `Score dropped ${Math.abs(scoreDelta).toFixed(1)} points (max drop: ${policy.maxScoreDrop})`,
        });

        // Compute violation diff
        const baselineRules = new Map<string, { impact: string; count: number }>();
        for (const v of baselineScan.violations) {
          const key = `${v.ruleId}:${v.impact}`;
          const existing = baselineRules.get(key);
          baselineRules.set(key, { impact: v.impact, count: (existing?.count ?? 0) + 1 });
        }

        const currentRules = new Map<string, { impact: string; count: number }>();
        for (const v of scan.violations) {
          const key = `${v.ruleId}:${v.impact}`;
          const existing = currentRules.get(key);
          currentRules.set(key, { impact: v.impact, count: (existing?.count ?? 0) + 1 });
        }

        // New violations: in current but not baseline (or count increased)
        for (const [key, curr] of currentRules) {
          const base = baselineRules.get(key);
          const diff = curr.count - (base?.count ?? 0);
          if (diff > 0) {
            const ruleId = key.split(":")[0];
            newViolations.push({ ruleId, impact: curr.impact, count: diff });
          }
        }

        // Fixed violations: in baseline but not current (or count decreased)
        for (const [key, base] of baselineRules) {
          const curr = currentRules.get(key);
          const diff = base.count - (curr?.count ?? 0);
          if (diff > 0) {
            const ruleId = key.split(":")[0];
            fixedViolations.push({ ruleId, impact: base.impact, count: diff });
          }
        }

        // Check 5: Max new violations
        const totalNew = newViolations.reduce((sum, v) => sum + v.count, 0);
        checks.push({
          name: "New Violations",
          passed: totalNew <= policy.maxNewViolations,
          actual: totalNew,
          threshold: policy.maxNewViolations,
          message: totalNew <= policy.maxNewViolations
            ? `${totalNew} new violations (max ${policy.maxNewViolations})`
            : `${totalNew} new violations exceeds max ${policy.maxNewViolations}`,
        });
      }
    }

    const allPassed = checks.every((c) => c.passed);

    // Auto-promote baseline on pass
    if (allPassed && policy.autoPromoteBaseline) {
      await prisma.guardPolicy.update({
        where: { id: policy.id },
        data: {
          baselineScanId: scanId,
          baselineScore: score,
          baselineLockedAt: new Date(),
        },
      });
    }

    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { url: true } });

    verdicts.push({
      passed: allPassed,
      policyId: policy.id,
      policyName: policy.name,
      siteUrl: site?.url ?? "",
      currentScore: score,
      baselineScore: policy.baselineScore,
      scoreDelta,
      checks,
      newViolations,
      fixedViolations,
      summary: allPassed
        ? `✅ Guard passed: ${checks.length} checks OK`
        : `❌ Guard failed: ${checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`,
    });
  }

  return verdicts;
}
