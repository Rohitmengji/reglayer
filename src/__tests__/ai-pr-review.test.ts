/**
 * Pull request accessibility review.
 *
 * The behaviour that decides whether this tool survives contact with a real team:
 * it must never fail a PR for a violation the author did not write. A gate people
 * disable protects nothing, so "does not block on pre-existing" is tested harder than
 * "does block on regressions".
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PR_POLICY,
  exitCodeFor,
  reviewPullRequest,
  type Finding,
} from "@/lib/ai/review/pr-verdict";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "button-name",
    url: "https://example.com/checkout",
    selector: "#close-btn",
    impact: "serious",
    file: "src/components/Dialog.tsx",
    line: 42,
    ...overrides,
  };
}

describe("regressions, not absolute state", () => {
  it("blocks when the PR introduces a serious violation", () => {
    const review = reviewPullRequest([], [finding()]);

    expect(review.verdict).toBe("block");
    expect(exitCodeFor(review)).toBe(1);
  });

  it("does NOT block on pre-existing violations", () => {
    const existing = finding({ impact: "critical" });

    // A legacy site full of issues must still be able to merge unrelated work,
    // otherwise the team sets the threshold to zero and the gate becomes decorative.
    const review = reviewPullRequest([existing], [existing]);

    expect(review.verdict).toBe("pass");
    expect(review.preExisting).toHaveLength(1);
    expect(review.introduced).toHaveLength(0);
  });

  it("passes a PR that changes nothing accessibility-related", () => {
    const existing = [finding(), finding({ selector: "#other" })];
    expect(reviewPullRequest(existing, existing).verdict).toBe("pass");
  });

  it("blocks a regression even when the total count falls", () => {
    // Absolute-threshold gates miss this entirely: totals improved, yet this PR
    // introduced a new critical issue.
    const base = [
      finding({ selector: "#a", impact: "minor" }),
      finding({ selector: "#b", impact: "minor" }),
      finding({ selector: "#c", impact: "minor" }),
    ];
    const head = [finding({ selector: "#new", impact: "critical" })];

    const review = reviewPullRequest(base, head);

    expect(review.verdict).toBe("block");
    expect(review.introduced).toHaveLength(1);
    expect(review.resolved).toHaveLength(3);
  });

  it("comments without blocking on a newly introduced minor issue", () => {
    const review = reviewPullRequest([], [finding({ impact: "minor" })]);

    expect(review.verdict).toBe("comment");
    expect(exitCodeFor(review)).toBe(0);
  });

  it("treats the same rule on a different element as a new finding", () => {
    const review = reviewPullRequest([finding({ selector: "#a" })], [finding({ selector: "#b" })]);
    expect(review.introduced).toHaveLength(1);
  });

  it("treats the same rule on a different page as a new finding", () => {
    const review = reviewPullRequest(
      [finding({ url: "https://example.com/a" })],
      [finding({ url: "https://example.com/b" })],
    );
    expect(review.introduced).toHaveLength(1);
  });
});

describe("reporting tone and content", () => {
  it("credits fixes, so the reviewer is not purely negative", () => {
    // A bot that only complains gets muted.
    const review = reviewPullRequest([finding()], []);
    expect(review.summary).toContain("fixes");
    expect(review.resolved).toHaveLength(1);
  });

  it("says explicitly that pre-existing issues are not blocking", () => {
    const existing = finding();
    const review = reviewPullRequest([existing], [existing]);
    expect(review.summary.toLowerCase()).toContain("not blocking");
  });

  it("reports a clean PR plainly", () => {
    expect(reviewPullRequest([], []).summary).toContain("No new accessibility issues");
  });
});

describe("comment construction", () => {
  it("groups repeated findings into one comment per rule per file", () => {
    const head = Array.from({ length: 12 }, (_, i) =>
      finding({ selector: `#btn-${i}` }),
    );

    const review = reviewPullRequest([], head);

    // Twelve identical findings in one component are one problem with one fix.
    expect(review.comments).toHaveLength(1);
    expect(review.comments[0].occurrences).toBe(12);
  });

  it("caps inline comments so the PR stays readable", () => {
    const head = Array.from({ length: 40 }, (_, i) =>
      finding({ ruleId: `rule-${i}`, file: `src/File${i}.tsx` }),
    );

    const review = reviewPullRequest([], head, DEFAULT_PR_POLICY);

    // A bot leaving forty comments is dismissed, not reviewed.
    expect(review.comments.length).toBeLessThanOrEqual(DEFAULT_PR_POLICY.maxComments);
    expect(review.summary).toContain("40");
  });

  it("orders comments by severity", () => {
    const review = reviewPullRequest([], [
      finding({ ruleId: "minor-rule", impact: "minor", file: "a.tsx" }),
      finding({ ruleId: "critical-rule", impact: "critical", file: "b.tsx" }),
    ]);

    expect(review.comments[0].body).toContain("critical-rule");
  });

  it("attaches WCAG references and a fix to a known rule", () => {
    const review = reviewPullRequest([], [finding({ ruleId: "button-name" })]);
    const body = review.comments[0].body;

    expect(body).toContain("SC 4.1.2");
    expect(body).toContain("Suggested fix");
  });

  it("marks a fix that needs human judgement as a starting point", () => {
    const review = reviewPullRequest([], [finding({ ruleId: "button-name" })]);

    // Offering a one-click fix the bot cannot actually author produces
    // aria-label="" at scale and turns the scan green while making the site worse.
    expect(review.comments[0].body).toContain("not a drop-in");
  });

  it("surfaces the top regression risk in the comment", () => {
    const review = reviewPullRequest([], [finding({ ruleId: "button-name" })]);
    expect(review.comments[0].body).toContain("Watch out");
  });

  it("still comments usefully for a rule with no authored guidance", () => {
    const review = reviewPullRequest([], [finding({ ruleId: "unmapped-rule" })]);

    expect(review.comments[0].body).toContain("unmapped-rule");
    expect(review.comments[0].body).toContain("#close-btn");
  });

  it("carries source position when the scanner mapped one", () => {
    const review = reviewPullRequest([], [finding({ file: "src/App.tsx", line: 12 })]);
    expect(review.comments[0]).toMatchObject({ file: "src/App.tsx", line: 12 });
  });

  it("handles findings with no source mapping", () => {
    const review = reviewPullRequest([], [finding({ file: undefined, line: undefined })]);
    expect(review.comments[0].file).toBeUndefined();
    expect(review.comments[0].body.length).toBeGreaterThan(0);
  });

  it("flags which comments are blocking", () => {
    const review = reviewPullRequest([], [
      finding({ impact: "critical", ruleId: "a", file: "a.tsx" }),
      finding({ impact: "minor", ruleId: "b", file: "b.tsx" }),
    ]);

    expect(review.comments.find((c) => c.body.includes("critical"))?.blocking).toBe(true);
    expect(review.comments.find((c) => c.body.includes("minor"))?.blocking).toBe(false);
  });
});

describe("policy", () => {
  it("respects a stricter blocking policy", () => {
    const review = reviewPullRequest([], [finding({ impact: "minor" })], {
      ...DEFAULT_PR_POLICY,
      blockingImpacts: ["critical", "serious", "moderate", "minor"],
    });

    expect(review.verdict).toBe("block");
  });

  it("respects a permissive policy that never blocks", () => {
    const review = reviewPullRequest([], [finding({ impact: "critical" })], {
      ...DEFAULT_PR_POLICY,
      blockingImpacts: [],
    });

    expect(review.verdict).toBe("comment");
    expect(exitCodeFor(review)).toBe(0);
  });
});
