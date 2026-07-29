/**
 * RegLayer — Pull Request Accessibility Review
 *
 * Decides what an automated reviewer should say on a PR, and whether it should block.
 *
 * WHY THE EXISTING GATE IS NOT ENOUGH: `action.yml` fails a build on ABSOLUTE
 * thresholds — `fail-on-score: 80`, `fail-on-critical: 0`, `fail-on-serious: 3`. That
 * answers "is this site compliant?", but the question a PR asks is "did this change make
 * it worse?" Using the first to answer the second has two failure modes, and both are
 * common enough to be predictable:
 *
 *   1. A team inheriting a legacy site at score 62 can never pass. They set the
 *      threshold to 0, and the gate becomes decorative. A gate people disable protects
 *      nothing.
 *   2. A PR that genuinely introduces a regression passes anyway, as long as the totals
 *      stay under the limit.
 *
 * So the unit of judgement here is the DIFF between base and head, not the state of
 * head. Only newly-introduced findings can block. Pre-existing ones are reported as
 * context and never fail a build, because failing someone's unrelated PR for a
 * violation they did not write is precisely how these tools lose their audience.
 *
 * FIXES ARE REPORTED TOO. A reviewer that only ever complains gets muted; one that says
 * "you also fixed 4 of these" gets read.
 */

import { buildRemediationGuidance } from "@/lib/ai/remediation/guidance";

export type Impact = "critical" | "serious" | "moderate" | "minor";

export interface Finding {
  ruleId: string;
  url: string;
  selector: string;
  impact: Impact;
  /** Source position, when the scanner could map the selector back to a file. */
  file?: string;
  line?: number;
}

export interface ReviewComment {
  /** Present when the finding maps to source; otherwise the comment goes in the summary. */
  file?: string;
  line?: number;
  body: string;
  /** How many occurrences of this rule this single comment represents. */
  occurrences: number;
  blocking: boolean;
}

export type Verdict = "block" | "comment" | "pass";

export interface PrReviewPolicy {
  /** Impacts that fail the build when newly introduced. */
  blockingImpacts: Impact[];
  /**
   * Cap on inline comments.
   *
   * A bot that leaves eighty comments is not reviewed, it is dismissed. The remainder
   * is summarised instead.
   */
  maxComments: number;
}

export const DEFAULT_PR_POLICY: PrReviewPolicy = {
  blockingImpacts: ["critical", "serious"],
  maxComments: 10,
};

export interface PrReview {
  introduced: Finding[];
  resolved: Finding[];
  preExisting: Finding[];
  verdict: Verdict;
  comments: ReviewComment[];
  summary: string;
}

const IMPACT_ORDER: Record<Impact, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

/** Identity of a finding across two scans. */
function identity(finding: Finding): string {
  return `${finding.url}::${finding.ruleId}::${finding.selector}`;
}

/**
 * Group introduced findings into one comment per rule per file.
 *
 * Twelve identical `button-name` findings in one component are one problem with one
 * fix, and posting twelve comments obscures that rather than emphasising it.
 */
function buildComments(
  introduced: readonly Finding[],
  policy: PrReviewPolicy,
): ReviewComment[] {
  const groups = new Map<string, Finding[]>();

  for (const finding of introduced) {
    const key = `${finding.ruleId}::${finding.file ?? "unmapped"}`;
    const existing = groups.get(key);
    if (existing) existing.push(finding);
    else groups.set(key, [finding]);
  }

  const comments: ReviewComment[] = [...groups.values()]
    .sort((a, b) => IMPACT_ORDER[a[0].impact] - IMPACT_ORDER[b[0].impact])
    .map((group) => {
      const lead = group[0];
      const blocking = policy.blockingImpacts.includes(lead.impact);
      const guidance = buildRemediationGuidance(lead.ruleId, lead.selector);

      const lines: string[] = [
        `**${lead.ruleId}** — ${lead.impact}${group.length > 1 ? ` (${group.length} occurrences)` : ""}`,
      ];

      if (guidance) {
        lines.push("", guidance.problem);
        if (guidance.wcag.length > 0) {
          const refs = guidance.wcag
            .map((w) => `[SC ${w.id} ${w.name} (Level ${w.level})](${w.url})`)
            .join(", ");
          lines.push("", `**WCAG:** ${refs}`);
        }
        lines.push("", "**Suggested fix**", "```tsx", guidance.examples.react, "```");

        // Only offer a one-click suggestion when applying it without judgement is safe.
        // Offering to auto-insert a label the bot cannot write produces `aria-label=""`
        // at scale — the scan goes green and the product gets worse.
        if (!guidance.confidence.autoApplicable) {
          lines.push(
            "",
            `_This fix needs a human decision (${guidance.confidence.rationale}) — ` +
            `the snippet above is a starting point, not a drop-in._`,
          );
        }

        if (guidance.regressionRisk.length > 0) {
          lines.push("", `**Watch out:** ${guidance.regressionRisk[0].risk}`);
        }
      } else {
        lines.push("", `Introduced by this change at \`${lead.selector}\`.`);
      }

      return {
        file: lead.file,
        line: lead.line,
        body: lines.join("\n"),
        occurrences: group.length,
        blocking,
      };
    });

  return comments.slice(0, policy.maxComments);
}

function describe(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Review a pull request by diffing base against head.
 */
export function reviewPullRequest(
  baseFindings: readonly Finding[],
  headFindings: readonly Finding[],
  policy: PrReviewPolicy = DEFAULT_PR_POLICY,
): PrReview {
  const baseIds = new Set(baseFindings.map(identity));
  const headIds = new Set(headFindings.map(identity));

  const introduced = headFindings.filter((f) => !baseIds.has(identity(f)));
  const resolved = baseFindings.filter((f) => !headIds.has(identity(f)));
  const preExisting = headFindings.filter((f) => baseIds.has(identity(f)));

  const blockers = introduced.filter((f) => policy.blockingImpacts.includes(f.impact));

  const verdict: Verdict =
    blockers.length > 0 ? "block" : introduced.length > 0 ? "comment" : "pass";

  const parts: string[] = [];

  if (introduced.length === 0) {
    parts.push("No new accessibility issues introduced.");
  } else {
    parts.push(`${describe(introduced.length, "new accessibility issue")} introduced.`);
    if (blockers.length > 0) {
      parts.push(`${describe(blockers.length, "must be resolved")} before merge.`);
    }
  }

  // Improvements are reported before the pre-existing backlog, so the message a
  // developer reads first is about what they changed.
  if (resolved.length > 0) {
    parts.push(`This change also fixes ${describe(resolved.length, "existing issue")}. 🎉`);
  }

  if (preExisting.length > 0) {
    parts.push(
      `${describe(preExisting.length, "pre-existing issue")} remain on the affected pages — ` +
      "reported for context and not blocking this PR.",
    );
  }

  return {
    introduced,
    resolved,
    preExisting,
    verdict,
    comments: buildComments(introduced, policy),
    summary: parts.join(" "),
  };
}

/** Non-zero exits fail the workflow step. */
export function exitCodeFor(review: PrReview): number {
  return review.verdict === "block" ? 1 : 0;
}
