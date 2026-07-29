/**
 * Fix confidence.
 *
 * Confidence exists to gate automation. Its failure mode is asymmetric: wrongly marking
 * a fix auto-applicable ships a plausible-but-wrong label to real users, while wrongly
 * withholding one costs a click. The tests weight that asymmetry.
 */

import { describe, it, expect } from "vitest";
import { assessConfidence, type FixCharacteristics } from "@/lib/ai/remediation/confidence";
import { buildRemediationGuidance } from "@/lib/ai/remediation/guidance";

function characteristics(overrides: Partial<FixCharacteristics> = {}): FixCharacteristics {
  return {
    requiresHumanContent: false,
    requiresDesignDecision: false,
    contextDependent: false,
    hasSingleCorrectFix: true,
    ...overrides,
  };
}

describe("confidence is derived, not asserted", () => {
  it("rates a purely mechanical fix highest", () => {
    const result = assessConfidence(characteristics());

    expect(result.level).toBe("high");
    expect(result.score).toBe(1);
    expect(result.autoApplicable).toBe(true);
  });

  it("drops sharply when a human must author the words", () => {
    const result = assessConfidence(characteristics({ requiresHumanContent: true }));
    expect(result.level).not.toBe("high");
  });

  it("drops sharply when a visual decision is required", () => {
    const result = assessConfidence(characteristics({ requiresDesignDecision: true }));
    expect(result.level).not.toBe("high");
  });

  it("explains itself, so a low score is actionable", () => {
    const result = assessConfidence(characteristics({ requiresHumanContent: true }));
    expect(result.rationale.length).toBeGreaterThan(20);
    expect(result.rationale.toLowerCase()).toContain("wording");
  });

  it("never returns a negative score", () => {
    const worst = assessConfidence({
      requiresHumanContent: true,
      requiresDesignDecision: true,
      contextDependent: true,
      hasSingleCorrectFix: false,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.level).toBe("low");
  });
});

describe("auto-application gate", () => {
  it("refuses automation whenever content must be authored, at any score", () => {
    // This is the rule that stops a bot emitting aria-label="Button" across a codebase
    // and turning the scan green while making the site worse.
    const result = assessConfidence(characteristics({ requiresHumanContent: true }));
    expect(result.autoApplicable).toBe(false);
  });

  it("refuses automation for design decisions", () => {
    expect(assessConfidence(characteristics({ requiresDesignDecision: true })).autoApplicable)
      .toBe(false);
  });

  it("permits automation only for mechanical, single-answer fixes", () => {
    expect(assessConfidence(characteristics()).autoApplicable).toBe(true);
    expect(assessConfidence(characteristics({ hasSingleCorrectFix: false })).autoApplicable)
      .toBe(false);
  });
});

describe("authored rules report honest confidence", () => {
  it("marks button-name as NOT auto-applicable", () => {
    const guidance = buildRemediationGuidance("button-name", "<button/>")!;

    // An IDE cannot know the button closes a dialog rather than submitting a form.
    expect(guidance.confidence.autoApplicable).toBe(false);
    expect(guidance.confidence.level).not.toBe("high");
  });

  it("marks image-alt as NOT auto-applicable", () => {
    const guidance = buildRemediationGuidance("image-alt", "<img/>")!;
    expect(guidance.confidence.autoApplicable).toBe(false);
  });
});

describe("guidance completeness", () => {
  const RULES = ["button-name", "image-alt"];

  it.each(RULES)("%s provides every requested section", (ruleId) => {
    const g = buildRemediationGuidance(ruleId, "<x/>")!;

    expect(g.rootCause.length).toBeGreaterThan(0);
    expect(g.wcagExplanation.length).toBeGreaterThan(0);
    expect(g.developerExplanation.length).toBeGreaterThan(0);
    expect(g.examples.html.length).toBeGreaterThan(0);
    expect(g.examples.react.length).toBeGreaterThan(0);
    expect(g.examples.nextjs.length).toBeGreaterThan(0);
    expect(g.cssImprovements.length).toBeGreaterThan(0);
    expect(g.ariaImprovements.length).toBeGreaterThan(0);
    expect(g.confidence.rationale.length).toBeGreaterThan(0);
  });

  it("leads ARIA advice with the native-HTML alternative", () => {
    // The first rule of ARIA is not to use ARIA; guidance that opens with an attribute
    // teaches the opposite habit.
    const g = buildRemediationGuidance("button-name", "<button/>")!;
    expect(g.ariaImprovements[0].toLowerCase()).toContain("prefer native");
  });

  it("warns against redundant roles rather than only what to add", () => {
    const aria = buildRemediationGuidance("button-name", "<button/>")!.ariaImprovements.join(" ");
    expect(aria).toContain('role="button"');
    expect(aria.toLowerCase()).toContain("do not");
  });

  it("gives Next.js advice that differs from plain React", () => {
    const g = buildRemediationGuidance("button-name", "<button/>")!;

    // A fix copied from a React example fails to compile in an App Router server
    // component — advice that ignores that does not run.
    expect(g.examples.nextjs).toContain("use client");
    expect(g.examples.nextjs).not.toBe(g.examples.react);
  });

  it("identifies the component-level root cause, not just the symptom", () => {
    const g = buildRemediationGuidance("button-name", "<button/>")!;
    expect(g.rootCause.toLowerCase()).toMatch(/component|shared/);
  });
});
