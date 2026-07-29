/**
 * RegLayer — Fix Confidence Assessment
 *
 * WHY CONFIDENCE IS COMPUTED, NOT ASSERTED: a hand-written "confidence: high" is an
 * opinion that drifts from reality the moment a template is edited. Deriving it from
 * properties of the fix means the score and the reasoning cannot disagree.
 *
 * WHAT IT IS ACTUALLY FOR: gating automation. An IDE that offers a one-click fix needs
 * to know whether applying it without human review is safe. The determining question is
 * not "is this rule well understood" — `button-name` is perfectly well understood — but
 * "does the correct fix require a decision only a human can make".
 *
 * That distinction matters more than it first appears. An IDE cannot know that a button
 * closes a dialog rather than submitting a form, so it cannot author the label. It CAN
 * safely mark a decorative icon `aria-hidden`. The first is a scaffold; the second is a
 * fix. Conflating them is how auto-remediation tools produce `aria-label="Button"` at
 * scale and make sites measurably worse while turning the scan green.
 */

export type FixConfidence = "high" | "medium" | "low";

export interface FixCharacteristics {
  /** The fix requires words a human must author (a label, alt text, an error message). */
  requiresHumanContent: boolean;
  /** The fix requires a visual decision (a colour, a size, a layout change). */
  requiresDesignDecision: boolean;
  /** The correct fix depends on surrounding markup the rule cannot see. */
  contextDependent: boolean;
  /** There is exactly one correct remedy, not a family of options. */
  hasSingleCorrectFix: boolean;
}

export interface ConfidenceAssessment {
  level: FixConfidence;
  /** 0..1, so thresholds can be tuned without re-labelling every rule. */
  score: number;
  rationale: string;
  /**
   * Whether an IDE or CI bot may apply this without human review.
   *
   * Deliberately stricter than `level`: a fix can be well understood and still require
   * a human, and shipping a plausible-but-wrong label is worse than leaving the
   * violation visible.
   */
  autoApplicable: boolean;
}

export function assessConfidence(characteristics: FixCharacteristics): ConfidenceAssessment {
  const { requiresHumanContent, requiresDesignDecision, contextDependent, hasSingleCorrectFix } =
    characteristics;

  let score = 1;
  const reasons: string[] = [];

  // Content and design decisions are the two things automation genuinely cannot do.
  // They dominate the score rather than nudging it.
  if (requiresHumanContent) {
    score -= 0.45;
    reasons.push("requires wording only a person who knows the intent can write");
  }
  if (requiresDesignDecision) {
    score -= 0.45;
    reasons.push("requires a visual decision an automated fix cannot make");
  }
  if (contextDependent) {
    score -= 0.2;
    reasons.push("the correct remedy depends on surrounding markup");
  }
  if (!hasSingleCorrectFix) {
    score -= 0.15;
    reasons.push("several valid remedies exist and the best one depends on the codebase");
  }

  score = Math.max(0, Math.round(score * 100) / 100);

  const level: FixConfidence = score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low";

  return {
    level,
    score,
    rationale: reasons.length === 0
      ? "Mechanical change with one correct outcome and no authored content."
      : `Reduced because it ${reasons.join("; ")}.`,
    // A human decision anywhere in the fix disqualifies automation outright, regardless
    // of the numeric score. `hasSingleCorrectFix` is required too: where several valid
    // remedies exist, an IDE should OFFER them as alternatives rather than silently
    // choose one on the developer's behalf.
    autoApplicable:
      level === "high"
      && hasSingleCorrectFix
      && !requiresHumanContent
      && !requiresDesignDecision,
  };
}
