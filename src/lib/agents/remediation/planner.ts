/**
 * RegLayer — Autonomous Accessibility Agent: PURE planner
 *
 * "Devin for Accessibility." Where today's AI only EXPLAINS an issue, this agent
 * plans and drives the full remediation lifecycle:
 *
 *   understand → locate → propose fix → (review gate) → open PR → verify →
 *   close issue → generate proof
 *
 * This module is the PURE brain: given a scan's violations and an autonomy level,
 * it triages what can be auto-fixed, routes risky/ambiguous work to a human, and
 * decides which lifecycle stages may run. It has NO side effects and NO DB — the
 * orchestrator (agent.ts) executes the plan against real engines.
 *
 * SAFETY IS A FIRST-CLASS OUTPUT, not an afterthought:
 *   - Risky categories (e.g. contrast — alters visual design) are NEVER
 *     auto-applied, at any autonomy level.
 *   - Categories whose VALUE needs a human (alt text, labels) force a review gate.
 *   - Anything the engine can't fix is routed to a developer, never faked.
 */

import {
  FIXABLE_RULES,
  REVIEW_CATEGORIES,
  RISKY_CATEGORIES,
  type FixCategory,
  type ViolationLike,
} from "@/lib/remediation/fixability";

// ── Types ───────────────────────────────────────────────────────────────────

/** How much the agent is allowed to do without a human. */
export type AutonomyLevel =
  | "suggest" // plan only — no side effects (understand → locate → propose)
  | "assisted" // prepare everything, but a human approves before any change lands
  | "autonomous"; // auto-apply SAFE, unambiguous fixes end-to-end; escalate the rest

/** Lifecycle stages, in order — mirror the product's autonomous-agent story. */
export type AgentStage =
  | "understand" // triage the scan: what's fixable, what needs a human
  | "locate" // map each fixable violation to its component + selector
  | "propose" // generate the concrete fix (markup patch + guidance)
  | "review_gate" // human sign-off before any irreversible change
  | "open_pr" // raise a PR / issue with the proposed fixes
  | "verify" // re-scan to confirm the fix actually resolved the violation
  | "close_issue" // mark the resolved violations fixed
  | "prove"; // issue a tamper-evident compliance proof of the improvement

export interface RoutedViolation {
  ruleId: string;
  impact: string;
  category: FixCategory | null;
  /** Engine can add correct markup autonomously and safely. */
  autoApplicable: boolean;
  /** Markup can be added but the VALUE needs a human (e.g. alt text). */
  needsReview: boolean;
  /** Changing this can break visual design — never auto-applied. */
  risky: boolean;
  /** No engine fix exists — a developer must handle it. */
  needsDeveloper: boolean;
}

export interface PlannedStage {
  stage: AgentStage;
  /** Whether this stage will run for this plan. */
  willRun: boolean;
  /** Whether reaching this stage requires human approval first. */
  requiresApproval: boolean;
  reason: string;
}

export interface RemediationPlan {
  autonomy: AutonomyLevel;
  routed: RoutedViolation[];
  counts: {
    total: number;
    autoApplicable: number;
    needsReview: number;
    risky: number;
    needsDeveloper: number;
  };
  stages: PlannedStage[];
  /** True if a human approval gate stands between planning and any change. */
  requiresApproval: boolean;
  /** Rule ids the agent will attempt to auto-apply (safe subset). */
  autoApplyRuleIds: string[];
  summary: string;
}

// ── Routing ─────────────────────────────────────────────────────────────────

/** Route a single violation into a fix lane (pure, deterministic). */
export function routeViolation(v: ViolationLike): RoutedViolation {
  const ruleId = v.ruleId ?? v.id ?? "";
  const impact = (v.impact ?? "moderate").toLowerCase();
  const category = FIXABLE_RULES[ruleId] ?? null;

  if (!category) {
    return { ruleId, impact, category: null, autoApplicable: false, needsReview: false, risky: false, needsDeveloper: true };
  }
  const risky = RISKY_CATEGORIES.has(category);
  const needsReview = REVIEW_CATEGORIES.has(category);
  // Auto-applicable only when the engine fix is both safe AND unambiguous.
  const autoApplicable = !risky && !needsReview;
  return { ruleId, impact, category, autoApplicable, needsReview, risky, needsDeveloper: false };
}

// ── Planning ────────────────────────────────────────────────────────────────

const STAGE_ORDER: AgentStage[] = [
  "understand",
  "locate",
  "propose",
  "review_gate",
  "open_pr",
  "verify",
  "close_issue",
  "prove",
];

/**
 * Build the full remediation plan for a scan's violations.
 *
 * @param violations one row per axe rule (aggregating affected elements)
 * @param autonomy   how far the agent may proceed without a human
 */
export function planRemediation(
  violations: ViolationLike[],
  autonomy: AutonomyLevel = "assisted",
): RemediationPlan {
  const routed = violations.map(routeViolation);

  const counts = {
    total: routed.length,
    autoApplicable: routed.filter((r) => r.autoApplicable).length,
    needsReview: routed.filter((r) => r.needsReview).length,
    risky: routed.filter((r) => r.risky).length,
    needsDeveloper: routed.filter((r) => r.needsDeveloper).length,
  };

  const autoApplyRuleIds = [...new Set(routed.filter((r) => r.autoApplicable).map((r) => r.ruleId))];

  // A review gate is required whenever a change would land AND (a human-in-the-loop
  // level is chosen OR there is review/risky work that must not be auto-applied).
  const wouldChange = autonomy !== "suggest";
  const hasEscalation = counts.needsReview > 0 || counts.risky > 0;
  const requiresApproval = wouldChange && (autonomy === "assisted" || hasEscalation);

  const stages: PlannedStage[] = STAGE_ORDER.map((stage) =>
    planStage(stage, autonomy, counts, requiresApproval),
  );

  return {
    autonomy,
    routed,
    counts,
    stages,
    requiresApproval,
    autoApplyRuleIds,
    summary: buildSummary(autonomy, counts, requiresApproval, autoApplyRuleIds.length),
  };
}

function planStage(
  stage: AgentStage,
  autonomy: AutonomyLevel,
  counts: RemediationPlan["counts"],
  requiresApproval: boolean,
): PlannedStage {
  const hasAutoWork = counts.autoApplicable > 0;

  switch (stage) {
    case "understand":
    case "locate":
    case "propose":
      // Always safe — no side effects, run regardless of autonomy.
      return { stage, willRun: true, requiresApproval: false, reason: "Read-only analysis — always runs." };

    case "review_gate":
      return requiresApproval
        ? { stage, willRun: true, requiresApproval: false, reason: "Human sign-off required before any change lands." }
        : { stage, willRun: false, requiresApproval: false, reason: "No approval needed for this plan." };

    case "open_pr":
      if (autonomy === "suggest") {
        return { stage, willRun: false, requiresApproval: false, reason: "Suggest mode makes no external changes." };
      }
      return {
        stage,
        willRun: hasAutoWork || counts.needsReview > 0,
        requiresApproval,
        reason: hasAutoWork || counts.needsReview > 0
          ? "Raise a PR/issue with the proposed fixes."
          : "Nothing fixable to raise.",
      };

    case "verify":
    case "close_issue":
      if (autonomy === "suggest") {
        return { stage, willRun: false, requiresApproval: false, reason: "Suggest mode does not modify state." };
      }
      return {
        stage,
        willRun: hasAutoWork,
        requiresApproval,
        reason: hasAutoWork ? "Re-scan and close only auto-applied, verified fixes." : "No auto-applied fixes to verify.",
      };

    case "prove":
      if (autonomy === "suggest") {
        return { stage, willRun: false, requiresApproval: false, reason: "Suggest mode issues no proof." };
      }
      return {
        stage,
        willRun: hasAutoWork,
        requiresApproval,
        reason: hasAutoWork ? "Issue a tamper-evident proof of the verified improvement." : "No verified change to prove.",
      };
  }
}

function buildSummary(
  autonomy: AutonomyLevel,
  counts: RemediationPlan["counts"],
  requiresApproval: boolean,
  autoApplyCount: number,
): string {
  if (counts.total === 0) return "No violations — nothing to remediate.";

  const lead =
    autonomy === "suggest"
      ? `Planned ${counts.total} issue${counts.total === 1 ? "" : "s"} (suggest-only — no changes made).`
      : autonomy === "autonomous"
        ? `Autonomous run over ${counts.total} issue${counts.total === 1 ? "" : "s"}.`
        : `Assisted run over ${counts.total} issue${counts.total === 1 ? "" : "s"}.`;

  const parts: string[] = [];
  if (autoApplyCount > 0) parts.push(`${autoApplyCount} auto-fixable safely`);
  if (counts.needsReview > 0) parts.push(`${counts.needsReview} need human review`);
  if (counts.risky > 0) parts.push(`${counts.risky} risky (never auto-applied)`);
  if (counts.needsDeveloper > 0) parts.push(`${counts.needsDeveloper} need a developer`);

  const gate = requiresApproval ? " Awaiting human approval before any change lands." : "";
  return `${lead} ${parts.join(", ")}.${gate}`;
}
