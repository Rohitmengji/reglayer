/**
 * RegLayer — Autonomous Accessibility Agent: ORCHESTRATOR (server-only)
 *
 * Drives the remediation lifecycle for a scan by stepping a state machine over
 * the engines that already exist — nothing here re-implements a capability:
 *
 *   understand   → analyzeFixability        (src/lib/remediation/fixability.ts)
 *   locate       → componentSignature       (src/lib/ai/graph/knowledge-graph.ts)
 *   propose      → remediate                (src/lib/remediation/engine.ts)
 *   review_gate  → createApprovalRequest    (src/lib/ai/approval/service.ts)
 *   open_pr      → createIssueFromViolation  (src/lib/integrations/github.ts)
 *   verify+close → verifyViolationFix       (src/lib/violations/status.ts)
 *   prove        → issueProof               (src/lib/vault/proofEngine.ts)
 *
 * SAFETY: every stage that has an EXTERNAL or IRREVERSIBLE effect (PR, re-scan,
 * status change, proof) runs ONLY when the plan permits it AND the required
 * capability is configured. Missing capability → the stage is honestly SKIPPED
 * with a reason, never faked. Human-in-the-loop gating is enforced by the plan.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { analyzeFixability } from "@/lib/remediation/fixability";
import { remediate, type FixRecord } from "@/lib/remediation/engine";
import { componentSignature } from "@/lib/ai/graph/knowledge-graph";
import { createApprovalRequest } from "@/lib/ai/approval/service";
import { createIssueFromViolation, type GitHubConfig } from "@/lib/integrations/github";
import { verifyViolationFix } from "@/lib/violations/status";
import { issueProof } from "@/lib/vault/proofEngine";
import { planRemediation, type AgentStage, type AutonomyLevel, type RemediationPlan } from "./planner";

export type StageStatus = "completed" | "blocked" | "skipped" | "failed";

export interface StageResult {
  stage: AgentStage;
  status: StageStatus;
  detail: string;
  data?: Record<string, unknown>;
}

export interface RemediationRun {
  scanId: string;
  url: string;
  autonomy: AutonomyLevel;
  plan: RemediationPlan;
  steps: StageResult[];
  /** Set when the run pauses awaiting human approval. */
  blockedOnApprovalId?: string;
  /** Artifacts produced this run. */
  artifacts: {
    generatedFixes: FixRecord[];
    prUrls: string[];
    verifiedRuleIds: string[];
    proofId?: string;
  };
  summary: string;
}

export interface RunAgentOptions {
  autonomy?: AutonomyLevel;
  actorUserId: string;
  workspaceId: string;
  /** Optional GitHub target for the open_pr stage. Absent → stage skipped. */
  github?: GitHubConfig;
  /** Public report URL used in the raised issue body. */
  reportUrl?: string;
  /** True when a human has approved a prior run's review gate. */
  approved?: boolean;
}

interface AgentViolation {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string | null;
  tags: string[];
  wcagCriteria: string | null;
  affectedElements: unknown;
}

/**
 * Run the autonomous remediation agent for one scan. Deterministic ordering;
 * side-effecting stages are individually guarded.
 */
export async function runRemediationAgent(
  scanId: string,
  opts: RunAgentOptions,
): Promise<RemediationRun | null> {
  const autonomy: AutonomyLevel = opts.autonomy ?? "assisted";

  const scan = await prisma.scan.findFirst({
    where: { id: scanId, workspaceId: opts.workspaceId },
    select: {
      id: true,
      url: true,
      siteId: true,
      violations: {
        select: {
          id: true, ruleId: true, impact: true, description: true, help: true,
          helpUrl: true, tags: true, wcagCriteria: true, affectedElements: true,
        },
      },
    },
  });
  if (!scan) return null;

  const violations = scan.violations as AgentViolation[];
  const plan = planRemediation(violations, autonomy);

  const steps: StageResult[] = [];
  const artifacts: RemediationRun["artifacts"] = { generatedFixes: [], prUrls: [], verifiedRuleIds: [] };
  let blockedOnApprovalId: string | undefined;

  // Map ruleId → the safe/auto-applicable routing decision for quick lookup.
  const autoApplyRuleIds = new Set(plan.autoApplyRuleIds);
  const autoViolations = violations.filter((v) => autoApplyRuleIds.has(v.ruleId));

  // ── Stage: understand ──────────────────────────────────────────────────────
  const fixability = analyzeFixability(violations.map((v) => ({ ruleId: v.ruleId, impact: v.impact })));
  steps.push({
    stage: "understand",
    status: "completed",
    detail: `${fixability.autoFixable}/${fixability.total} auto-fixable, ${fixability.needsDeveloper} need a developer.`,
    data: { byCategory: fixability.byCategory, needsDeveloperRules: fixability.needsDeveloperRules },
  });

  // ── Stage: locate ──────────────────────────────────────────────────────────
  const located = violations.map((v) => ({
    ruleId: v.ruleId,
    impact: v.impact,
    component: componentSignature(v.affectedElements),
  }));
  steps.push({
    stage: "locate",
    status: "completed",
    detail: `Mapped ${located.length} violations to ${new Set(located.map((l) => l.component)).size} components.`,
    data: { located },
  });

  // ── Stage: propose ─────────────────────────────────────────────────────────
  // Generate concrete markup patches for the safe subset using the remediation engine.
  const generated = generateFixes(autoViolations);
  artifacts.generatedFixes = generated;
  steps.push({
    stage: "propose",
    status: "completed",
    detail: `Generated ${generated.length} markup fix${generated.length === 1 ? "" : "es"} for ${autoViolations.length} auto-fixable violation${autoViolations.length === 1 ? "" : "s"}.`,
    data: { categories: countBy(generated.map((f) => f.category)) },
  });

  // ── Stage: review_gate ─────────────────────────────────────────────────────
  const gateStage = plan.stages.find((s) => s.stage === "review_gate");
  const needsApproval = plan.requiresApproval && !opts.approved;
  if (gateStage?.willRun) {
    if (needsApproval) {
      const approval = await createApprovalRequest({
        type: "REMEDIATION_PLAN",
        title: `Autonomous remediation for ${scan.url}`,
        content: { plan: plan.summary, autoApplyRuleIds: plan.autoApplyRuleIds, counts: plan.counts },
        metadata: { scanId: scan.id, autonomy },
        requestedBy: opts.actorUserId,
        workspaceId: opts.workspaceId,
      });
      blockedOnApprovalId = approval.id;
      steps.push({
        stage: "review_gate",
        status: "blocked",
        detail: "Awaiting human approval before any change lands.",
        data: { approvalId: approval.id },
      });
    } else {
      steps.push({ stage: "review_gate", status: "completed", detail: "Human approval already granted." });
    }
  }

  // If blocked on approval, stop here — no side effects proceed.
  if (blockedOnApprovalId) {
    return finalize(scan.id, scan.url, autonomy, plan, steps, artifacts, blockedOnApprovalId);
  }

  const changesAllowed = autonomy !== "suggest";

  // ── Stage: open_pr ─────────────────────────────────────────────────────────
  if (stageWillRun(plan, "open_pr") && changesAllowed) {
    if (!opts.github) {
      steps.push({ stage: "open_pr", status: "skipped", detail: "GitHub not configured for this workspace." });
    } else {
      const prUrls: string[] = [];
      const reportUrl = opts.reportUrl ?? scan.url;
      // Raise an issue for each auto-fixable violation (bounded).
      for (const v of autoViolations.slice(0, 25)) {
        try {
          const issue = await createIssueFromViolation(opts.github, v, scan.url, scan.id, reportUrl);
          prUrls.push(issue.url);
        } catch (err) {
          steps.push({ stage: "open_pr", status: "failed", detail: err instanceof Error ? err.message : "GitHub issue failed." });
        }
      }
      artifacts.prUrls = prUrls;
      if (prUrls.length > 0) {
        steps.push({ stage: "open_pr", status: "completed", detail: `Raised ${prUrls.length} GitHub issue${prUrls.length === 1 ? "" : "s"}.`, data: { prUrls } });
      }
    }
  }

  // ── Stage: verify + close_issue ────────────────────────────────────────────
  // Only autonomous mode auto-verifies; verifyViolationFix re-scans the live URL
  // and marks the violation VERIFIED only if the rule no longer appears.
  if (stageWillRun(plan, "verify") && autonomy === "autonomous") {
    const verifiedRuleIds: string[] = [];
    for (const v of autoViolations.slice(0, 10)) {
      try {
        const res = await verifyViolationFix(v.id);
        if (res.verified) verifiedRuleIds.push(v.ruleId);
      } catch {
        /* verification is best-effort; a failed re-scan simply leaves it open */
      }
    }
    artifacts.verifiedRuleIds = verifiedRuleIds;
    steps.push({
      stage: "verify",
      status: verifiedRuleIds.length > 0 ? "completed" : "skipped",
      detail: verifiedRuleIds.length > 0
        ? `Re-scan confirmed ${verifiedRuleIds.length} fix${verifiedRuleIds.length === 1 ? "" : "es"}.`
        : "No fixes confirmed by re-scan yet (source change may not be deployed).",
      data: { verifiedRuleIds },
    });
    steps.push({
      stage: "close_issue",
      status: verifiedRuleIds.length > 0 ? "completed" : "skipped",
      detail: verifiedRuleIds.length > 0 ? `Closed ${verifiedRuleIds.length} verified violation${verifiedRuleIds.length === 1 ? "" : "s"}.` : "Nothing verified to close.",
    });
  } else if (stageWillRun(plan, "verify")) {
    steps.push({ stage: "verify", status: "skipped", detail: "Assisted mode defers verification to the human-merged change." });
  }

  // ── Stage: prove ───────────────────────────────────────────────────────────
  if (stageWillRun(plan, "prove") && autonomy === "autonomous" && artifacts.verifiedRuleIds.length > 0) {
    try {
      const proof = await issueProof({
        siteId: scan.siteId ?? "",
        scanId: scan.id,
        workspaceId: opts.workspaceId,
        type: "REMEDIATION_RECORD",
        title: `Autonomous remediation proof — ${scan.url}`,
        description: `Verified ${artifacts.verifiedRuleIds.length} accessibility fixes autonomously.`,
        standard: "WCAG 2.2 AA",
      });
      artifacts.proofId = proof.id;
      steps.push({ stage: "prove", status: "completed", detail: `Issued tamper-evident proof ${proof.id} (chain #${proof.chainIndex}).`, data: { proofId: proof.id } });
    } catch (err) {
      steps.push({ stage: "prove", status: "failed", detail: err instanceof Error ? err.message : "Proof issuance failed." });
    }
  }

  return finalize(scan.id, scan.url, autonomy, plan, steps, artifacts, blockedOnApprovalId);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Run the remediation engine over the affected elements to produce real patches. */
function generateFixes(violations: AgentViolation[]): FixRecord[] {
  const htmlParts: string[] = [];
  for (const v of violations) {
    const els = Array.isArray(v.affectedElements) ? (v.affectedElements as Array<{ html?: string }>) : [];
    for (const el of els.slice(0, 5)) {
      if (typeof el.html === "string" && el.html.trim()) htmlParts.push(el.html);
    }
  }
  if (htmlParts.length === 0) return [];
  const doc = `<!DOCTYPE html><html><head><title>fixture</title></head><body>${htmlParts.join("\n")}</body></html>`;
  try {
    return remediate(doc).fixesApplied;
  } catch {
    return [];
  }
}

function stageWillRun(plan: RemediationPlan, stage: AgentStage): boolean {
  return plan.stages.find((s) => s.stage === stage)?.willRun ?? false;
}

function countBy(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}

function finalize(
  scanId: string,
  url: string,
  autonomy: AutonomyLevel,
  plan: RemediationPlan,
  steps: StageResult[],
  artifacts: RemediationRun["artifacts"],
  blockedOnApprovalId?: string,
): RemediationRun {
  const done = steps.filter((s) => s.status === "completed").length;
  const summary = blockedOnApprovalId
    ? `Paused for approval after ${done} stage${done === 1 ? "" : "s"}. ${plan.summary}`
    : `Completed ${done}/${steps.length} stages. ${plan.summary}`;
  return { scanId, url, autonomy, plan, steps, blockedOnApprovalId, artifacts, summary };
}
