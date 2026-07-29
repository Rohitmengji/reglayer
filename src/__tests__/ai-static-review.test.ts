/**
 * Static accessibility review of changed code.
 *
 * Two properties decide whether this is usable: comments must land on the RIGHT line
 * (an off-by-one puts expert advice next to unrelated code), and the review must never
 * comment on lines the author did not touch (which is how these tools get switched off).
 */

import { describe, it, expect } from "vitest";
import {
  buildStaticReview,
  enrichFinding,
  filterToChangedLines,
  parseUnifiedDiff,
  reviewedRules,
  type LintFinding,
} from "@/lib/ai/review/static-review";
import { lookupCriterion } from "@/lib/ai/safety/wcag-fact-check";

const DIFF = `diff --git a/src/components/Menu.tsx b/src/components/Menu.tsx
index abc..def 100644
--- a/src/components/Menu.tsx
+++ b/src/components/Menu.tsx
@@ -10,6 +10,8 @@ export function Menu() {
   const [open, setOpen] = useState(false);
 
   return (
+    <div onClick={() => setOpen(!open)}>
+      Toggle
     <nav>
       <ul>
`;

function finding(overrides: Partial<LintFinding> = {}): LintFinding {
  return {
    file: "src/components/Menu.tsx",
    line: 13,
    ruleId: "jsx-a11y/click-events-have-key-events",
    message: "Visible, non-interactive elements with click handlers must have at least one keyboard listener.",
    ...overrides,
  };
}

describe("diff parsing", () => {
  it("records only added lines", () => {
    const changed = parseUnifiedDiff(DIFF);
    const lines = changed.get("src/components/Menu.tsx")!;

    // The hunk starts at 10; three context lines precede the additions.
    expect([...lines].sort((a, b) => a - b)).toEqual([13, 14]);
  });

  it("does not advance the counter for deleted lines", () => {
    const diff = `--- a/a.tsx
+++ b/a.tsx
@@ -1,4 +1,3 @@
 keep
-removed
-removed
+added
`;
    // "keep" is line 1; the additions land at line 2 because deletions do not exist
    // in the new file.
    expect([...parseUnifiedDiff(diff).get("a.tsx")!]).toEqual([2]);
  });

  it("handles multiple hunks in one file", () => {
    const diff = `--- a/a.tsx
+++ b/a.tsx
@@ -1,2 +1,3 @@
 one
+two
@@ -20,2 +21,3 @@
 twenty
+twentyone
`;
    expect([...parseUnifiedDiff(diff).get("a.tsx")!].sort((a, b) => a - b)).toEqual([2, 22]);
  });

  it("handles multiple files", () => {
    const diff = `--- a/a.tsx
+++ b/a.tsx
@@ -1,1 +1,2 @@
 x
+added-a
--- a/b.tsx
+++ b/b.tsx
@@ -5,1 +5,2 @@
 y
+added-b
`;
    const changed = parseUnifiedDiff(diff);
    expect([...changed.keys()]).toEqual(["a.tsx", "b.tsx"]);
    expect([...changed.get("b.tsx")!]).toEqual([6]);
  });

  it("returns nothing for an empty diff", () => {
    expect(parseUnifiedDiff("").size).toBe(0);
  });
});

describe("only changed lines are reviewed", () => {
  it("keeps a finding on an added line", () => {
    const kept = filterToChangedLines([finding({ line: 13 })], parseUnifiedDiff(DIFF));
    expect(kept).toHaveLength(1);
  });

  it("drops a finding on an untouched line in a changed file", () => {
    // This is the property that makes the review incremental: a two-line PR must not
    // surface a file's entire accessibility history.
    const dropped = filterToChangedLines([finding({ line: 99 })], parseUnifiedDiff(DIFF));
    expect(dropped).toHaveLength(0);
  });

  it("drops findings in files the PR did not touch", () => {
    const dropped = filterToChangedLines(
      [finding({ file: "src/other/Untouched.tsx", line: 13 })],
      parseUnifiedDiff(DIFF),
    );
    expect(dropped).toHaveLength(0);
  });
});

describe("enrichment", () => {
  it("cites only WCAG criteria that exist", () => {
    for (const ruleId of reviewedRules()) {
      const enriched = enrichFinding(finding({ ruleId }))!;
      for (const ref of enriched.wcag) {
        // A criterion invented in a review comment is read as fact by whoever acts on it.
        expect(lookupCriterion(ref.id)).toBeDefined();
      }
    }
  });

  it("maps keyboard rules to SC 2.1.1", () => {
    const enriched = enrichFinding(finding({ ruleId: "jsx-a11y/click-events-have-key-events" }))!;
    expect(enriched.wcag.map((w) => w.id)).toContain("2.1.1");
    expect(enriched.category).toBe("keyboard");
  });

  it("returns null for a rule with no authored knowledge", () => {
    // Better silent than dressing a bare lint message up as expert guidance.
    expect(enrichFinding(finding({ ruleId: "jsx-a11y/some-unmapped-rule" }))).toBeNull();
  });

  it("gives every rule an explanation and a distinct teaching note", () => {
    for (const ruleId of reviewedRules()) {
      const enriched = enrichFinding(finding({ ruleId }))!;
      expect(enriched.explanation.length).toBeGreaterThan(40);
      expect(enriched.education.length).toBeGreaterThan(40);
      expect(enriched.education).not.toBe(enriched.explanation);
    }
  });

  it("treats autofocus as a judgement call, not an automatic defect", () => {
    const enriched = enrichFinding(finding({ ruleId: "jsx-a11y/no-autofocus" }))!;

    // Moving focus into a dialog is REQUIRED by the ARIA Authoring Practices;
    // the anti-pattern is autofocus on page load.
    expect(enriched.severity).toBe("info");
    expect(enriched.education.toLowerCase()).toContain("dialog");
  });

  it("marks alt text as needing human authoring", () => {
    const enriched = enrichFinding(finding({ ruleId: "jsx-a11y/alt-text" }))!;
    expect(enriched.confidence.autoApplicable).toBe(false);
  });

  it("marks a misspelled ARIA attribute as mechanically fixable", () => {
    const enriched = enrichFinding(finding({ ruleId: "jsx-a11y/aria-props" }))!;
    expect(enriched.confidence.autoApplicable).toBe(true);
  });
});

describe("review assembly", () => {
  it("blocks on a newly introduced keyboard failure", () => {
    const review = buildStaticReview([finding({ line: 13 })], DIFF);

    expect(review.verdict).toBe("block");
    expect(review.comments[0]).toMatchObject({
      file: "src/components/Menu.tsx",
      line: 13,
      blocking: true,
    });
  });

  it("passes when the changed lines are clean", () => {
    const review = buildStaticReview([finding({ line: 99 })], DIFF);

    expect(review.verdict).toBe("pass");
    expect(review.summary).toContain("No new accessibility issues");
  });

  it("comments without blocking on an informational finding", () => {
    const review = buildStaticReview(
      [finding({ line: 13, ruleId: "jsx-a11y/no-autofocus" })],
      DIFF,
    );

    expect(review.verdict).toBe("comment");
    expect(review.comments[0].blocking).toBe(false);
  });

  it("includes severity, WCAG, suggestion, education, and confidence", () => {
    const body = buildStaticReview([finding({ line: 13 })], DIFF).comments[0].body;

    expect(body).toContain("Blocking");
    expect(body).toContain("SC 2.1.1");
    expect(body).toContain("```diff");
    expect(body).toContain("Why this matters");
    expect(body).toContain("Fix confidence");
  });

  it("orders blocking comments first", () => {
    const review = buildStaticReview([
      finding({ line: 14, ruleId: "jsx-a11y/no-autofocus" }),
      finding({ line: 13, ruleId: "jsx-a11y/aria-props" }),
    ], DIFF);

    expect(review.comments[0].blocking).toBe(true);
  });

  it("collapses the teaching note so the comment stays scannable", () => {
    const body = buildStaticReview([finding({ line: 13 })], DIFF).comments[0].body;
    expect(body).toContain("<details>");
  });
});
