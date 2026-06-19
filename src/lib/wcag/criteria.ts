/**
 * WHY: The WCAG 2.1 AA criteria catalog was duplicated across wcag-matrix, vpat-generator,
 *      and now manual testing. Single source of truth prevents drift and enables shared logic.
 * WHAT: Exports WCAG_CRITERIA (52 A/AA entries), MANUAL_ONLY_CRITERIA set (criteria that
 *       require human verification even when automation is silent), and helpers.
 * HOW: Pure module — no Prisma, no server imports, fully unit-testable. Consumed by
 *      wcag-matrix route, VPAT generator, and manual test plan builder.
 */

export interface WcagCriterion {
  criterion: string;
  level: "A" | "AA";
  principle: "Perceivable" | "Operable" | "Understandable" | "Robust";
  title: string;
}

/**
 * WCAG 2.1 Level A + AA criteria — the 52 success criteria that constitute
 * the legal conformance target for most accessibility regulations (ADA, EN 301 549, EAA).
 */
export const WCAG_CRITERIA: WcagCriterion[] = [
  // ─── Perceivable ───────────────────────────────────────────────────────────
  { criterion: "1.1.1", level: "A", principle: "Perceivable", title: "Non-text Content" },
  { criterion: "1.2.1", level: "A", principle: "Perceivable", title: "Audio-only and Video-only" },
  { criterion: "1.2.2", level: "A", principle: "Perceivable", title: "Captions (Prerecorded)" },
  { criterion: "1.2.3", level: "A", principle: "Perceivable", title: "Audio Description or Media Alternative" },
  { criterion: "1.2.5", level: "AA", principle: "Perceivable", title: "Audio Description (Prerecorded)" },
  { criterion: "1.3.1", level: "A", principle: "Perceivable", title: "Info and Relationships" },
  { criterion: "1.3.2", level: "A", principle: "Perceivable", title: "Meaningful Sequence" },
  { criterion: "1.3.3", level: "A", principle: "Perceivable", title: "Sensory Characteristics" },
  { criterion: "1.3.4", level: "AA", principle: "Perceivable", title: "Orientation" },
  { criterion: "1.3.5", level: "AA", principle: "Perceivable", title: "Identify Input Purpose" },
  { criterion: "1.4.1", level: "A", principle: "Perceivable", title: "Use of Color" },
  { criterion: "1.4.2", level: "A", principle: "Perceivable", title: "Audio Control" },
  { criterion: "1.4.3", level: "AA", principle: "Perceivable", title: "Contrast (Minimum)" },
  { criterion: "1.4.4", level: "AA", principle: "Perceivable", title: "Resize Text" },
  { criterion: "1.4.5", level: "AA", principle: "Perceivable", title: "Images of Text" },
  { criterion: "1.4.10", level: "AA", principle: "Perceivable", title: "Reflow" },
  { criterion: "1.4.11", level: "AA", principle: "Perceivable", title: "Non-text Contrast" },
  { criterion: "1.4.12", level: "AA", principle: "Perceivable", title: "Text Spacing" },
  { criterion: "1.4.13", level: "AA", principle: "Perceivable", title: "Content on Hover or Focus" },
  // ─── Operable ──────────────────────────────────────────────────────────────
  { criterion: "2.1.1", level: "A", principle: "Operable", title: "Keyboard" },
  { criterion: "2.1.2", level: "A", principle: "Operable", title: "No Keyboard Trap" },
  { criterion: "2.1.4", level: "A", principle: "Operable", title: "Character Key Shortcuts" },
  { criterion: "2.2.1", level: "A", principle: "Operable", title: "Timing Adjustable" },
  { criterion: "2.2.2", level: "A", principle: "Operable", title: "Pause, Stop, Hide" },
  { criterion: "2.3.1", level: "A", principle: "Operable", title: "Three Flashes or Below" },
  { criterion: "2.4.1", level: "A", principle: "Operable", title: "Bypass Blocks" },
  { criterion: "2.4.2", level: "A", principle: "Operable", title: "Page Titled" },
  { criterion: "2.4.3", level: "A", principle: "Operable", title: "Focus Order" },
  { criterion: "2.4.4", level: "A", principle: "Operable", title: "Link Purpose (In Context)" },
  { criterion: "2.4.5", level: "AA", principle: "Operable", title: "Multiple Ways" },
  { criterion: "2.4.6", level: "AA", principle: "Operable", title: "Headings and Labels" },
  { criterion: "2.4.7", level: "AA", principle: "Operable", title: "Focus Visible" },
  { criterion: "2.5.1", level: "A", principle: "Operable", title: "Pointer Gestures" },
  { criterion: "2.5.2", level: "A", principle: "Operable", title: "Pointer Cancellation" },
  { criterion: "2.5.3", level: "A", principle: "Operable", title: "Label in Name" },
  { criterion: "2.5.4", level: "A", principle: "Operable", title: "Motion Actuation" },
  // ─── Understandable ────────────────────────────────────────────────────────
  { criterion: "3.1.1", level: "A", principle: "Understandable", title: "Language of Page" },
  { criterion: "3.1.2", level: "AA", principle: "Understandable", title: "Language of Parts" },
  { criterion: "3.2.1", level: "A", principle: "Understandable", title: "On Focus" },
  { criterion: "3.2.2", level: "A", principle: "Understandable", title: "On Input" },
  { criterion: "3.2.3", level: "AA", principle: "Understandable", title: "Consistent Navigation" },
  { criterion: "3.2.4", level: "AA", principle: "Understandable", title: "Consistent Identification" },
  { criterion: "3.3.1", level: "A", principle: "Understandable", title: "Error Identification" },
  { criterion: "3.3.2", level: "A", principle: "Understandable", title: "Labels or Instructions" },
  { criterion: "3.3.3", level: "AA", principle: "Understandable", title: "Error Suggestion" },
  { criterion: "3.3.4", level: "AA", principle: "Understandable", title: "Error Prevention (Legal, Financial, Data)" },
  // ─── Robust ────────────────────────────────────────────────────────────────
  { criterion: "4.1.1", level: "A", principle: "Robust", title: "Parsing" },
  { criterion: "4.1.2", level: "A", principle: "Robust", title: "Name, Role, Value" },
  { criterion: "4.1.3", level: "AA", principle: "Robust", title: "Status Messages" },
];

/**
 * Criteria that REQUIRE human verification even when axe-core reports no violations.
 * Automation can detect structural failures but cannot determine:
 * - Whether alt text is *meaningful* (not just present)
 * - Whether focus order is *logical* (not just tab-able)
 * - Whether semantics convey *correct* meaning
 * - Whether keyboard operation is *complete*
 * - Whether instructions are *clear*
 */
export const MANUAL_ONLY_CRITERIA = new Set([
  "1.1.1",  // Non-text Content — axe checks presence but not meaningfulness
  "1.3.1",  // Info and Relationships — semantic correctness needs human judgment
  "1.3.2",  // Meaningful Sequence — reading order is context-dependent
  "1.3.3",  // Sensory Characteristics — "click the red button" needs human eye
  "1.4.1",  // Use of Color — color-only indication is contextual
  "1.4.5",  // Images of Text — needs human to determine if text could be HTML
  "2.1.1",  // Keyboard — full operation requires human testing all workflows
  "2.1.2",  // No Keyboard Trap — requires sequential keyboard navigation
  "2.4.3",  // Focus Order — logical order is human-judged
  "2.4.4",  // Link Purpose — context-dependent meaning needs human
  "2.4.6",  // Headings and Labels — descriptive quality is human-judged
  "2.4.7",  // Focus Visible — visibility in context is human-judged
  "2.5.3",  // Label in Name — accessible name matching visible label
  "3.1.1",  // Language of Page — correct lang attribute value
  "3.1.2",  // Language of Parts — lang on foreign-language passages
  "3.2.1",  // On Focus — unexpected context changes are human-observed
  "3.2.2",  // On Input — unexpected behavior on input is human-observed
  "3.2.3",  // Consistent Navigation — cross-page consistency needs human
  "3.2.4",  // Consistent Identification — cross-page naming consistency
  "3.3.1",  // Error Identification — error messages exist and are clear
  "3.3.2",  // Labels or Instructions — presence and clarity
  "3.3.3",  // Error Suggestion — quality of error help text
  "3.3.4",  // Error Prevention — reversibility/confirmation on critical actions
  "4.1.2",  // Name, Role, Value — custom widgets need human verification
]);

/**
 * Litigation risk weight per criterion (higher = sued more often).
 * Derived from US DOJ settlements and demand letter patterns.
 */
export const LITIGATION_WEIGHTS: Record<string, number> = {
  "1.1.1": 95,   // #1 most cited in lawsuits
  "1.3.1": 75,
  "1.4.3": 70,
  "2.1.1": 90,   // #2 most cited
  "2.4.3": 65,
  "2.4.4": 60,
  "2.4.7": 55,
  "4.1.2": 80,   // #3 most cited
  "1.4.11": 50,
  "3.3.1": 45,
  "3.3.2": 45,
};

/** Get litigation weight for a criterion (default 30 for unlisted) */
export function getLitigationWeight(criterion: string): number {
  return LITIGATION_WEIGHTS[criterion] ?? 30;
}

/** Get a criterion by its ID */
export function getCriterion(id: string): WcagCriterion | undefined {
  return WCAG_CRITERIA.find((c) => c.criterion === id);
}

/** Get all criteria for a given principle */
export function getCriteriaByPrinciple(principle: WcagCriterion["principle"]): WcagCriterion[] {
  return WCAG_CRITERIA.filter((c) => c.principle === principle);
}

/** Check if a criterion requires manual testing */
export function isManualOnly(criterion: string): boolean {
  return MANUAL_ONLY_CRITERIA.has(criterion);
}
