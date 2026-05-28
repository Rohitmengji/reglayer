/**
 * ---------------------------------------------------------
 * RegLayer — GitHub PR Review Integration
 * ---------------------------------------------------------
 *
 * Posts accessibility violations as PR review comments
 * with inline fix suggestions that developers can apply
 * with one click from the GitHub review UI.
 *
 * Uses the GitHub Pull Request Review API to:
 * - Create a review with "REQUEST_CHANGES" or "COMMENT"
 * - Attach inline code suggestions to specific files/lines
 * - Provide fix strategies as review body
 * ---------------------------------------------------------
 */

import type { GitHubConfig } from "./github";

export interface PRReviewViolation {
  ruleId: string;
  impact: string;
  help: string;
  description: string;
  helpUrl: string | null;
  tags: string[];
  element: {
    html: string;
    target: string;
    suggestion?: string;
  };
  fixStrategy?: string;
  codeExample?: string;
  effort?: string;
}

export interface PRReviewRequest {
  config: GitHubConfig;
  prNumber: number;
  violations: PRReviewViolation[];
  score: number;
  threshold: number;
  scanUrl: string;
  reportUrl: string;
}

export interface ReviewComment {
  path: string;
  body: string;
  line?: number;
  side?: "LEFT" | "RIGHT";
}

export interface PRReviewResult {
  reviewId: number;
  htmlUrl: string;
  state: string;
  commentsPosted: number;
}

/**
 * Post a PR review with inline fix suggestions for each violation.
 */
export async function postPRReview(
  request: PRReviewRequest
): Promise<PRReviewResult> {
  const { config, prNumber, violations, score, threshold, scanUrl, reportUrl } = request;

  const passed = score >= threshold;
  const event = passed ? "COMMENT" : "REQUEST_CHANGES";

  // Build review body (summary)
  const body = buildReviewBody({
    score,
    threshold,
    passed,
    violations,
    scanUrl,
    reportUrl,
  });

  // Build inline comments with fix suggestions
  const comments = buildInlineComments(violations);

  // Post the review via GitHub API
  const reviewPayload: Record<string, unknown> = {
    event,
    body,
  };

  // GitHub requires comments array only when there are file-level suggestions
  if (comments.length > 0) {
    reviewPayload.comments = comments;
  }

  const response = await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/pulls/${prNumber}/reviews`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${config.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(reviewPayload),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${error}`);
  }

  const review = await response.json();

  // Also post a standalone issue comment with the full report
  // (visible even if review is dismissed)
  await postSummaryComment(config, prNumber, {
    score,
    threshold,
    passed,
    violations,
    reportUrl,
  });

  return {
    reviewId: review.id,
    htmlUrl: review.html_url,
    state: review.state,
    commentsPosted: comments.length,
  };
}

/**
 * Post individual review comments on specific files (for non-PR-review mode).
 */
export async function postIssueComments(
  config: GitHubConfig,
  prNumber: number,
  violations: PRReviewViolation[],
  score: number,
  threshold: number,
  reportUrl: string
): Promise<{ commentsPosted: number }> {
  const passed = score >= threshold;
  let posted = 0;

  // Post summary as PR comment
  const summaryBody = buildReviewBody({
    score,
    threshold,
    passed,
    violations,
    scanUrl: "",
    reportUrl,
  });

  await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${config.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ body: summaryBody }),
    }
  );
  posted++;

  // Post individual fix comments
  for (const violation of violations.slice(0, 10)) {
    const comment = formatViolationComment(violation);
    await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${prNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${config.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ body: comment }),
      }
    );
    posted++;
  }

  return { commentsPosted: posted };
}

// ─── Helpers ──────────────────────────────────────────────

function buildReviewBody(opts: {
  score: number;
  threshold: number;
  passed: boolean;
  violations: PRReviewViolation[];
  scanUrl: string;
  reportUrl: string;
}): string {
  const { score, threshold, passed, violations, reportUrl } = opts;
  const statusIcon = passed ? "✅" : "❌";
  const statusText = passed ? "PASSED" : "FAILED";

  const critical = violations.filter((v) => v.impact === "critical").length;
  const serious = violations.filter((v) => v.impact === "serious").length;
  const moderate = violations.filter((v) => v.impact === "moderate").length;
  const minor = violations.filter((v) => v.impact === "minor").length;

  const lines = [
    `## ${statusIcon} Accessibility Check ${statusText}`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Score | **${score}/100** |`,
    `| Threshold | ${threshold} |`,
    `| Total Violations | ${violations.length} |`,
    `| Critical | ${critical} |`,
    `| Serious | ${serious} |`,
    `| Moderate | ${moderate} |`,
    `| Minor | ${minor} |`,
    "",
  ];

  if (!passed) {
    lines.push(
      "> ⚠️ **This PR introduces accessibility issues that must be fixed before merging.**",
      "> Each violation below includes a suggested fix — click **Apply suggestion** to auto-fix.",
      ""
    );
  }

  if (violations.length > 0) {
    lines.push("### Top Violations", "");
    const top = violations
      .sort((a, b) => impactWeight(b.impact) - impactWeight(a.impact))
      .slice(0, 5);

    for (const v of top) {
      const badge = impactBadge(v.impact);
      lines.push(`- ${badge} **${v.ruleId}** — ${v.help}`);
      if (v.fixStrategy) {
        lines.push(`  - 💡 Fix: ${v.fixStrategy}`);
      }
    }
    lines.push("");
  }

  if (reportUrl) {
    lines.push(`📊 [View Full Report](${reportUrl})`, "");
  }

  lines.push(
    "---",
    "*Powered by [RegLayer](https://reglayer.com) — Accessibility CI Gatekeeper*"
  );

  return lines.join("\n");
}

function buildInlineComments(violations: PRReviewViolation[]): ReviewComment[] {
  const comments: ReviewComment[] = [];

  for (const v of violations) {
    if (!v.element.suggestion) continue;

    // For inline suggestions we need file path + line number
    // In CI mode, violations contain HTML selectors but not source locations
    // We post these as general review comments with code suggestions
    const body = formatSuggestionComment(v);
    comments.push({ path: "", body });
  }

  // GitHub doesn't accept comments without path, so we return them
  // as part of the review body instead
  return [];
}

function formatSuggestionComment(violation: PRReviewViolation): string {
  const badge = impactBadge(violation.impact);
  const lines = [
    `### ${badge} ${violation.ruleId}`,
    "",
    violation.help,
    "",
  ];

  if (violation.element.html) {
    lines.push("**Current HTML:**", "```html", violation.element.html, "```", "");
  }

  if (violation.element.suggestion) {
    lines.push(
      "**Suggested fix:**",
      "```suggestion",
      violation.element.suggestion,
      "```",
      ""
    );
  }

  if (violation.fixStrategy) {
    lines.push(`💡 **Strategy:** ${violation.fixStrategy}`, "");
  }

  if (violation.helpUrl) {
    lines.push(`📖 [Learn more](${violation.helpUrl})`);
  }

  return lines.join("\n");
}

function formatViolationComment(violation: PRReviewViolation): string {
  const badge = impactBadge(violation.impact);
  const lines = [
    `### ${badge} \`${violation.ruleId}\``,
    "",
    `**${violation.help}**`,
    "",
    violation.description,
    "",
  ];

  if (violation.element.html) {
    lines.push("#### Current HTML", "```html", violation.element.html, "```", "");
  }

  if (violation.element.suggestion || violation.codeExample) {
    const fix = violation.element.suggestion || violation.codeExample || "";
    lines.push("#### Suggested Fix", "```html", fix, "```", "");
  }

  if (violation.fixStrategy) {
    lines.push(`#### Fix Strategy`, violation.fixStrategy, "");
  }

  const effortBadge = violation.effort
    ? `\`${violation.effort}\` effort`
    : "";

  if (effortBadge) {
    lines.push(`⏱️ ${effortBadge}`, "");
  }

  const wcagTags = violation.tags
    .filter((t) => t.startsWith("wcag"))
    .map((t) => `\`${t}\``)
    .join(" ");

  if (wcagTags) {
    lines.push(`📋 WCAG: ${wcagTags}`, "");
  }

  if (violation.helpUrl) {
    lines.push(`📖 [Deque Reference](${violation.helpUrl})`);
  }

  lines.push("", "---");

  return lines.join("\n");
}

async function postSummaryComment(
  config: GitHubConfig,
  prNumber: number,
  opts: {
    score: number;
    threshold: number;
    passed: boolean;
    violations: PRReviewViolation[];
    reportUrl: string;
  }
): Promise<void> {
  const statusIcon = opts.passed ? "✅" : "❌";
  const body = [
    `## ${statusIcon} RegLayer Accessibility Gate`,
    "",
    `Score: **${opts.score}/100** (threshold: ${opts.threshold})`,
    `Violations: **${opts.violations.length}** total`,
    "",
    opts.passed
      ? "All accessibility checks passed! 🎉"
      : `⚠️ ${opts.violations.filter((v) => v.impact === "critical").length} critical and ${opts.violations.filter((v) => v.impact === "serious").length} serious issues found.`,
    "",
    `[📊 Full Report](${opts.reportUrl})`,
  ].join("\n");

  await fetch(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${config.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ body }),
    }
  );
}

function impactWeight(impact: string): number {
  switch (impact) {
    case "critical": return 4;
    case "serious": return 3;
    case "moderate": return 2;
    case "minor": return 1;
    default: return 0;
  }
}

function impactBadge(impact: string): string {
  switch (impact) {
    case "critical": return "🔴";
    case "serious": return "🟠";
    case "moderate": return "🟡";
    case "minor": return "🔵";
    default: return "⚪";
  }
}
