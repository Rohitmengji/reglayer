/**
 * Tests for the golden dataset and its grader.
 *
 * WHAT THIS IS AND IS NOT:
 *   This is the CI-safe half of evaluation. It makes NO model calls — it validates that
 *   the dataset is internally correct and that the grader scores correctly, both
 *   deterministically and in milliseconds.
 *
 *   The half that calls real models lives in scripts/eval-prompts.ts. That one costs
 *   money, needs API keys and depends on a third party, so it must not gate CI: a gate
 *   that fails for reasons unrelated to the change under review is a gate people learn
 *   to ignore.
 *
 * WHY THE DATASET ITSELF NEEDS TESTS:
 *   The previous FALLBACK_CHAIN in this codebase pointed at a model ID that did not
 *   exist and nobody noticed, because nothing executed it. A golden dataset has exactly
 *   the same failure mode: a typo'd criterion in `mustCite` would silently mark a
 *   correct answer wrong, and the metric would quietly measure nothing. These tests
 *   assert the dataset agrees with the WCAG ground truth it is graded against.
 */
import { describe, it, expect } from "vitest";

import { GOLDEN_CASES, casesByCategory } from "@/lib/ai/eval/golden-dataset";
import { gradeCase, buildReport, formatReport } from "@/lib/ai/eval/grader";
import { lookupCriterion, factCheckWcagResponse } from "@/lib/ai/safety/wcag-fact-check";

const byId = (id: string) => {
  const c = GOLDEN_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`fixture case ${id} missing`);
  return c;
};

/**
 * REGRESSION: found by the golden dataset on its very first run.
 *
 * factCheckWcagResponse matched conformance level with a case-insensitive
 * `\b(A{1,3})\b`, which also matches the English article "a". The sentence
 * "SC 1.4.3 is a Level AA criterion" therefore reported claimed="A" vs actual="AA"
 * — a false mismatch on a correct answer.
 *
 * This was not cosmetic. The guard runs on every chat response, and a warning now
 * reaches Sentry, AiEvent, and a user-visible "automated check flagged this answer"
 * banner. False positives on correct answers train users to ignore the one signal
 * that has to stay credible.
 */
describe("factCheckWcagResponse — conformance level detection", () => {
  it("does not treat the article 'a' as Level A", () => {
    const result = factCheckWcagResponse("SC 1.4.3 is a Level AA criterion requiring 4.5:1.");

    expect(result.claims.find((c) => c.criterion === "1.4.3")?.levelMismatch).toBeUndefined();
    expect(result.accuracy).toBe(1);
  });

  it("still detects a genuinely wrong level", () => {
    const result = factCheckWcagResponse("SC 1.4.3 is a Level A criterion.");

    expect(result.claims.find((c) => c.criterion === "1.4.3")?.levelMismatch)
      .toEqual({ claimed: "A", actual: "AA" });
  });

  it("accepts a bare parenthesised level", () => {
    const result = factCheckWcagResponse("Contrast (Minimum) — 1.4.3 (AA) — requires 4.5:1.");

    expect(result.claims.find((c) => c.criterion === "1.4.3")?.levelMismatch).toBeUndefined();
  });

  it("escapes every dot in the criterion id", () => {
    // Only the first dot was escaped, so "1.4.3" also matched strings like "1X4Y3".
    // A criterion id must not match a coincidental digit sequence.
    const result = factCheckWcagResponse("Ticket 1X4Y3 is unrelated to accessibility.");

    expect(result.claims).toEqual([]);
  });

  it("flags a genuinely fabricated criterion", () => {
    const result = factCheckWcagResponse("SC 1.4.20 requires background images.");

    expect(result.hasHallucinations).toBe(true);
    expect(result.claims.find((c) => c.criterion === "1.4.20")?.valid).toBe(false);
  });
});

describe("golden dataset integrity", () => {
  it("has unique case ids", () => {
    const ids = GOLDEN_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every mustCite criterion exists in the WCAG ground truth", () => {
    // A typo here would mark correct answers wrong and silently invert the metric.
    const bad: string[] = [];
    for (const c of GOLDEN_CASES) {
      for (const id of c.mustCite ?? []) {
        if (!lookupCriterion(id)) bad.push(`${c.id} -> ${id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every expectLevel matches the official level", () => {
    // Guards against the dataset asserting a level the specification disagrees with.
    const wrong: string[] = [];
    for (const c of GOLDEN_CASES) {
      if (!c.expectLevel) continue;
      const official = lookupCriterion(c.expectLevel.criterion);
      if (!official) { wrong.push(`${c.id}: unknown ${c.expectLevel.criterion}`); continue; }
      if (official.level !== c.expectLevel.level) {
        wrong.push(`${c.id}: expects ${c.expectLevel.level}, spec says ${official.level}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("trap cases reference criteria that genuinely do not exist", () => {
    // If a "trap" accidentally names a real criterion, the case rewards refusing to
    // answer a legitimate question — training the metric toward unhelpfulness.
    const traps = GOLDEN_CASES.filter((c) => c.category === "trap");
    expect(traps.length).toBeGreaterThan(0);

    for (const c of traps) {
      for (const id of c.mustNotCite ?? []) {
        expect(lookupCriterion(id), `${c.id} names real criterion ${id}`).toBeUndefined();
      }
    }
  });

  it("covers the categories that actually fail in production", () => {
    const categories = Object.keys(casesByCategory());
    // WCAG 2.2 postdates most training cutoffs, and traps are where confident
    // invention shows up. Both must be represented or the metric misses the real risk.
    expect(categories).toEqual(expect.arrayContaining(["trap", "wcag22", "threshold"]));
  });

  it("has enough cases for a category score to mean something", () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(25);
    for (const [category, cases] of Object.entries(casesByCategory())) {
      expect(cases.length, `${category} has too few cases`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("grader — hallucination handling", () => {
  it("scores a fabricated criterion as zero even when other facts are right", () => {
    // A hallucinated criterion is not a partial failure. It is the specific defect this
    // product cannot ship, so it must not average away against correct statements.
    const grade = gradeCase(
      byId("lookup-contrast-minimum"),
      "SC 1.4.3 Contrast (Minimum) is Level AA and requires 4.5:1. See also SC 1.4.20.",
    );

    expect(grade.hallucinated).toContain("1.4.20");
    expect(grade.score).toBe(0);
  });

  it("gives full marks to a correct, well-formed answer", () => {
    const grade = gradeCase(
      byId("lookup-contrast-minimum"),
      "WCAG 1.4.3 Contrast (Minimum) is a Level AA criterion requiring a contrast ratio of at least 4.5:1 for normal text.",
    );

    expect(grade.hallucinated).toEqual([]);
    expect(grade.score).toBe(1);
  });
});

describe("grader — trap cases", () => {
  it("rewards declining a criterion that does not exist", () => {
    const grade = gradeCase(
      byId("trap-nonexistent-1420"),
      "There is no WCAG success criterion with that number. WCAG 2.2 Guideline 1.4 ends at 1.4.13.",
    );

    // The response mentions 1.4.13, which is real — the grader must not treat a
    // correct clarifying reference as an affirmation of the fake criterion.
    expect(grade.hallucinated).toEqual([]);
    expect(grade.checks.find((c) => c.name === "declines-nonexistent-criterion")?.passed).toBe(false);
  });

  it("fails an answer that invents the criterion", () => {
    const grade = gradeCase(
      byId("trap-nonexistent-1420"),
      "SC 1.4.20 requires that all decorative images use CSS backgrounds. It is Level AA.",
    );

    expect(grade.hallucinated).toContain("1.4.20");
    expect(grade.score).toBe(0);
  });
});

describe("grader — conformance levels", () => {
  it("detects a wrong conformance level", () => {
    const grade = gradeCase(
      byId("level-resize-text"),
      "Resize Text 1.4.4 is a Level A requirement.",
    );

    const levelCheck = grade.checks.find((c) => c.name.startsWith("level-1.4.4"));
    expect(levelCheck?.passed).toBe(false);
    expect(grade.score).toBeLessThan(1);
  });

  it("accepts the correct conformance level", () => {
    const grade = gradeCase(
      byId("level-resize-text"),
      "Resize Text (SC 1.4.4) is Level AA.",
    );

    expect(grade.checks.find((c) => c.name.startsWith("level-1.4.4"))?.passed).toBe(true);
  });
});

describe("grader — content assertions", () => {
  it("fails when a required threshold is missing", () => {
    const grade = gradeCase(
      byId("threshold-contrast-normal-text"),
      "SC 1.4.3 requires sufficient contrast between text and background.",
    );

    expect(grade.checks.find((c) => c.name === "contains-4.5")?.passed).toBe(false);
  });

  it("fails when a commonly-confused criterion is cited", () => {
    // 1.2.4 is Captions (Live); the question is about prerecorded video.
    const grade = gradeCase(
      byId("scope-video-no-captions"),
      "That falls under SC 1.2.2 and SC 1.2.4.",
    );

    expect(grade.checks.find((c) => c.name === "avoids-1.2.4")?.passed).toBe(false);
  });
});

describe("report aggregation", () => {
  it("computes overall and per-category scores", () => {
    const grades = [
      gradeCase(byId("lookup-contrast-minimum"), "WCAG 1.4.3 Contrast (Minimum) is Level AA and requires 4.5:1 contrast."),
      gradeCase(byId("trap-nonexistent-1420"), "SC 1.4.20 is a Level AA criterion about images."),
    ];

    const report = buildReport(grades);

    expect(report.total).toBe(2);
    expect(report.hallucinationCount).toBe(1);
    expect(report.perCategory["criterion-lookup"].score).toBe(1);
    expect(report.perCategory["trap"].score).toBe(0);
    expect(report.score).toBeCloseTo(0.5, 5);
  });

  it("renders a summary that names the failing cases", () => {
    const report = buildReport([
      gradeCase(byId("trap-nonexistent-1420"), "SC 1.4.20 requires background images."),
    ]);

    const text = formatReport(report);

    expect(text).toContain("trap-nonexistent-1420");
    expect(text).toContain("HALLUCINATED");
  });

  it("handles an empty run without dividing by zero", () => {
    const report = buildReport([]);

    expect(report.total).toBe(0);
    expect(report.score).toBe(0);
  });
});
