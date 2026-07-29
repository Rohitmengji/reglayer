/**
 * RegLayer — Golden evaluation dataset for WCAG question answering
 *
 * WHY THIS EXISTS:
 *   Every prompt change was an unmeasured production experiment. `AiExperiment` and
 *   `PromptImprovement` models exist, `lib/ai/experiments` exists — but none of it can
 *   run without a metric, and there was no metric. You cannot A/B test without a way
 *   to say which variant is better.
 *
 * WHY IT CAN BE AUTO-GRADED:
 *   WCAG is a numbered specification. "Does SC 1.4.3 require 4.5:1?" has exactly one
 *   correct answer, and `lib/ai/safety/wcag-fact-check.ts` already holds the ground
 *   truth for all 57 criteria. That means scoring needs no human and no judge model —
 *   the expensive part of evaluation is already paid for.
 *
 * WHAT IS DELIBERATELY NOT HERE:
 *   Tone, helpfulness and phrasing. Those need human or LLM judging, are expensive and
 *   noisy, and are not what fails in production. What fails is a fabricated criterion
 *   number in an answer a customer pastes into a procurement document. This dataset
 *   measures exactly that.
 *
 * CASE DESIGN:
 *   The highest-value cases are the TRAPS — questions about criteria that do not exist,
 *   or that were added in WCAG 2.2 (after most models' training cutoffs). A model that
 *   confidently invents "SC 1.4.20" is the failure mode this product cannot afford.
 */

export type GoldenCategory =
  | "criterion-lookup"    // "what is SC X.X.X"
  | "conformance-level"   // "is X level A or AA"
  | "threshold"           // specific numeric requirements
  | "wcag22"              // criteria added in 2.2 — common hallucination surface
  | "trap"                // criterion does not exist; correct answer is to say so
  | "scope";              // which criterion applies to a described problem

export interface GoldenCase {
  id: string;
  question: string;
  category: GoldenCategory;
  /** Criteria the answer must reference to be correct. */
  mustCite?: string[];
  /**
   * Criteria whose presence indicates a wrong or confused answer — typically the
   * commonly-confused neighbour of the correct one.
   */
  mustNotCite?: string[];
  /** Case-insensitive substrings that must appear (numeric thresholds, key terms). */
  mustContain?: string[];
  /** Case-insensitive substrings that indicate a factually wrong answer. */
  mustNotContain?: string[];
  /** Assert the answer states the correct conformance level for a criterion. */
  expectLevel?: { criterion: string; level: "A" | "AA" | "AAA" };
  /**
   * True when the correct behaviour is to decline / say it doesn't exist.
   * Any criterion citation at all is a failure for these.
   */
  expectRefusal?: boolean;
}

export const GOLDEN_CASES: GoldenCase[] = [
  // ── Criterion lookup ──────────────────────────────────────────────────────
  {
    id: "lookup-contrast-minimum",
    question: "What is WCAG success criterion 1.4.3?",
    category: "criterion-lookup",
    mustCite: ["1.4.3"],
    mustContain: ["contrast"],
    expectLevel: { criterion: "1.4.3", level: "AA" },
  },
  {
    id: "lookup-non-text-content",
    question: "Explain SC 1.1.1 in plain language.",
    category: "criterion-lookup",
    mustCite: ["1.1.1"],
    mustContain: ["text alternative"],
    expectLevel: { criterion: "1.1.1", level: "A" },
  },
  {
    id: "lookup-info-and-relationships",
    question: "What does WCAG 1.3.1 require?",
    category: "criterion-lookup",
    mustCite: ["1.3.1"],
    mustContain: ["programmatically"],
    expectLevel: { criterion: "1.3.1", level: "A" },
  },
  {
    id: "lookup-keyboard",
    question: "What is success criterion 2.1.1?",
    category: "criterion-lookup",
    mustCite: ["2.1.1"],
    mustContain: ["keyboard"],
    expectLevel: { criterion: "2.1.1", level: "A" },
  },
  {
    id: "lookup-name-role-value",
    question: "Explain WCAG 4.1.2.",
    category: "criterion-lookup",
    mustCite: ["4.1.2"],
    mustContain: ["name", "role", "value"],
    expectLevel: { criterion: "4.1.2", level: "A" },
  },
  {
    id: "lookup-focus-visible",
    question: "What is SC 2.4.7 about?",
    category: "criterion-lookup",
    mustCite: ["2.4.7"],
    mustContain: ["focus"],
    expectLevel: { criterion: "2.4.7", level: "AA" },
  },

  // ── Conformance level ─────────────────────────────────────────────────────
  {
    id: "level-resize-text",
    question: "Is Resize Text (1.4.4) a Level A or Level AA criterion?",
    category: "conformance-level",
    mustCite: ["1.4.4"],
    expectLevel: { criterion: "1.4.4", level: "AA" },
  },
  {
    id: "level-use-of-color",
    question: "What conformance level is Use of Color?",
    category: "conformance-level",
    mustCite: ["1.4.1"],
    expectLevel: { criterion: "1.4.1", level: "A" },
  },
  {
    id: "level-reflow",
    question: "Which conformance level does Reflow fall under?",
    category: "conformance-level",
    mustCite: ["1.4.10"],
    expectLevel: { criterion: "1.4.10", level: "AA" },
  },
  {
    id: "level-orientation",
    question: "Is Orientation (1.3.4) required for AA conformance?",
    category: "conformance-level",
    mustCite: ["1.3.4"],
    expectLevel: { criterion: "1.3.4", level: "AA" },
  },
  {
    id: "level-error-identification",
    question: "What level is Error Identification?",
    category: "conformance-level",
    mustCite: ["3.3.1"],
    expectLevel: { criterion: "3.3.1", level: "A" },
  },

  // ── Numeric thresholds ────────────────────────────────────────────────────
  {
    id: "threshold-contrast-normal-text",
    question: "What contrast ratio does WCAG AA require for normal body text?",
    category: "threshold",
    mustCite: ["1.4.3"],
    mustContain: ["4.5"],
    mustNotContain: ["7:1 for normal", "3:1 for normal"],
  },
  {
    id: "threshold-contrast-large-text",
    question: "What is the minimum contrast ratio for large text under WCAG AA?",
    category: "threshold",
    mustCite: ["1.4.3"],
    mustContain: ["3:1"],
  },
  {
    id: "threshold-non-text-contrast",
    question: "What contrast ratio do UI components and graphics need?",
    category: "threshold",
    mustCite: ["1.4.11"],
    mustContain: ["3:1"],
  },
  {
    id: "threshold-reflow-width",
    question: "At what viewport width must content reflow without horizontal scrolling?",
    category: "threshold",
    mustCite: ["1.4.10"],
    mustContain: ["320"],
  },
  {
    id: "threshold-text-spacing",
    question: "What text spacing values must content support under WCAG 1.4.12?",
    category: "threshold",
    mustCite: ["1.4.12"],
    mustContain: ["1.5"],
  },

  // ── WCAG 2.2 additions — highest hallucination risk ───────────────────────
  // Most models were trained before or around 2.2's publication, so these are where
  // confident invention is most likely.
  {
    id: "wcag22-target-size",
    question: "What is WCAG 2.2 success criterion 2.5.8?",
    category: "wcag22",
    mustCite: ["2.5.8"],
    mustContain: ["24"],
    expectLevel: { criterion: "2.5.8", level: "AA" },
  },
  {
    id: "wcag22-focus-not-obscured",
    question: "Explain Focus Not Obscured (Minimum).",
    category: "wcag22",
    mustCite: ["2.4.11"],
    expectLevel: { criterion: "2.4.11", level: "AA" },
  },
  {
    id: "wcag22-dragging-movements",
    question: "What does WCAG 2.5.7 require?",
    category: "wcag22",
    mustCite: ["2.5.7"],
    mustContain: ["drag"],
    expectLevel: { criterion: "2.5.7", level: "AA" },
  },
  {
    id: "wcag22-redundant-entry",
    question: "What is Redundant Entry in WCAG 2.2?",
    category: "wcag22",
    mustCite: ["3.3.7"],
    expectLevel: { criterion: "3.3.7", level: "A" },
  },
  {
    id: "wcag22-accessible-authentication",
    question: "Explain Accessible Authentication (Minimum), SC 3.3.8.",
    category: "wcag22",
    mustCite: ["3.3.8"],
    mustContain: ["cognitive"],
    expectLevel: { criterion: "3.3.8", level: "AA" },
  },
  {
    id: "wcag22-consistent-help",
    question: "What is WCAG 3.2.6?",
    category: "wcag22",
    mustCite: ["3.2.6"],
    mustContain: ["help"],
    expectLevel: { criterion: "3.2.6", level: "A" },
  },

  // ── Traps — criteria that do not exist ────────────────────────────────────
  // The single most important category. A model that invents a plausible-looking
  // criterion number produces exactly the artefact that cannot appear in a compliance
  // report. The correct answer is to say it does not exist.
  {
    id: "trap-nonexistent-1420",
    question: "Explain WCAG success criterion 1.4.20.",
    category: "trap",
    expectRefusal: true,
    mustNotCite: ["1.4.20"],
  },
  {
    id: "trap-nonexistent-2119",
    question: "What does SC 2.1.19 require?",
    category: "trap",
    expectRefusal: true,
    mustNotCite: ["2.1.19"],
  },
  {
    id: "trap-nonexistent-5111",
    question: "Summarise WCAG criterion 5.1.1.",
    category: "trap",
    expectRefusal: true,
    mustNotCite: ["5.1.1"],
  },
  {
    id: "trap-nonexistent-3411",
    question: "Is SC 3.4.1 a Level AA requirement?",
    category: "trap",
    expectRefusal: true,
    mustNotCite: ["3.4.1"],
  },

  // ── Scope — mapping a described problem to the right criterion ────────────
  {
    id: "scope-missing-alt-text",
    question: "Our images have no alt attributes. Which WCAG criterion does that violate?",
    category: "scope",
    mustCite: ["1.1.1"],
  },
  {
    id: "scope-color-only-error",
    question: "We show form errors only by turning the field red. Which criterion fails?",
    category: "scope",
    mustCite: ["1.4.1"],
  },
  {
    id: "scope-no-focus-indicator",
    question: "Our buttons show no visible outline when tabbed to. Which SC is that?",
    category: "scope",
    mustCite: ["2.4.7"],
  },
  {
    id: "scope-video-no-captions",
    question: "Our prerecorded marketing videos have no captions. Which criterion applies?",
    category: "scope",
    mustCite: ["1.2.2"],
    mustNotCite: ["1.2.4"], // 1.2.4 is Captions (Live) — the classic confusion
  },
  {
    id: "scope-form-input-no-label",
    question: "Our search input has no associated label element. Which criteria apply?",
    category: "scope",
    mustCite: ["1.3.1"],
  },
  {
    id: "scope-tablist-missing-role",
    question: "We have buttons with role=tab but no parent with role=tablist. Which SC fails?",
    category: "scope",
    mustCite: ["1.3.1"],
  },
];

/** Cases grouped by category, for reporting. */
export function casesByCategory(): Record<GoldenCategory, GoldenCase[]> {
  const out = {} as Record<GoldenCategory, GoldenCase[]>;
  for (const c of GOLDEN_CASES) {
    (out[c.category] ??= []).push(c);
  }
  return out;
}
