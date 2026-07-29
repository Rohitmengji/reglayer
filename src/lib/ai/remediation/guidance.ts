/**
 * RegLayer — Structured Remediation Guidance
 *
 * Turns a detected violation into the seven things a developer actually needs:
 * problem, WCAG reference, current code, fixed code, why it works, regression risk,
 * and testing steps.
 *
 * THE CENTRAL DESIGN DECISION: WCAG references are LOOKED UP, NOT GENERATED.
 *
 * Every fact here — criterion number, name, conformance level, WCAG version — comes
 * from `safety/wcag-fact-check`, which holds ground truth for all 57 criteria. A model
 * asked "which criterion covers an unlabelled button" can answer "4.1.2" today and
 * invent "4.1.4" tomorrow, and a remediation plan citing a criterion that does not
 * exist is worse than no plan: it will be read by an auditor.
 *
 * Only genuinely open-ended prose should ever reach an LLM. Everything below is
 * deterministic, which also makes it testable and reproducible across runs — a
 * requirement for output used as compliance evidence.
 *
 * REGRESSION RISK is the section most tools omit, and it is where accessibility
 * expertise actually shows. Naive fixes routinely create NEW violations: the standard
 * "just add aria-label" advice for buttons silently breaks SC 2.5.3 Label in Name for
 * voice-control users. Shipping a fix that trades one violation for another is not
 * remediation.
 */

import { lookupCriterion } from "@/lib/ai/safety/wcag-fact-check";
import { assessConfidence, type ConfidenceAssessment, type FixCharacteristics } from "./confidence";

/** Derived from the lookup rather than imported: the interface is module-private. */
type WcagCriterion = NonNullable<ReturnType<typeof lookupCriterion>>;

/**
 * Framework-specific renderings of the same fix.
 *
 * WHY SEPARATE AND NOT ONE "CODE" FIELD: the correct fix genuinely differs by
 * framework. A Next.js App Router page cannot attach an `onClick` handler without a
 * client boundary, so a fix that compiles in plain React is a build error there.
 * Emitting one snippet and calling it universal produces advice that does not run.
 */
export interface FrameworkExamples {
  html: string;
  react: string;
  nextjs: string;
}

export interface RemediationGuidance {
  ruleId: string;
  /** What in the codebase produced this, as opposed to what the scanner observed. */
  rootCause: string;
  problem: string;
  /** Plain-language, for a report reader. */
  wcagExplanation: string;
  /** Mechanism-level, for the engineer applying the fix. */
  developerExplanation: string;
  wcag: WcagReference[];
  currentCode: string;
  fixedCode: string;
  examples: FrameworkExamples;
  /** Presentation-layer changes. Empty when the fix is purely semantic. */
  cssImprovements: string[];
  /**
   * ARIA changes, ordered so native-HTML alternatives come first.
   * The first rule of ARIA is not to use ARIA where an element already carries the
   * semantics, and guidance that leads with ARIA teaches the opposite habit.
   */
  ariaImprovements: string[];
  whyThisWorks: string;
  regressionRisk: RegressionRisk[];
  testingSteps: string[];
  confidence: ConfidenceAssessment;
}

export interface WcagReference {
  id: string;
  name: string;
  level: string;
  version: string;
  url: string;
  /** Why this criterion applies to this specific violation. */
  relevance: string;
}

export interface RegressionRisk {
  risk: string;
  mitigation: string;
}

/** Canonical WCAG understanding-doc link. */
function criterionUrl(criterion: WcagCriterion): string {
  const slug = criterion.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`;
}

/**
 * Resolve a criterion id to a full reference.
 *
 * Returns null for an unknown id rather than fabricating one. A silent drop is
 * recoverable; an invented criterion in an audit report is not.
 */
function reference(id: string, relevance: string): WcagReference | null {
  const criterion = lookupCriterion(id);
  if (!criterion) return null;

  return {
    id: criterion.id,
    name: criterion.name,
    level: criterion.level,
    version: criterion.version,
    url: criterionUrl(criterion),
    relevance,
  };
}

interface GuidanceTemplate {
  rootCause: string;
  problem: string;
  wcagExplanation: string;
  developerExplanation: string;
  /** Criterion ids plus why each applies. Validated against the WCAG database. */
  criteria: { id: string; relevance: string }[];
  fixedCode: (currentCode: string) => string;
  examples: FrameworkExamples;
  cssImprovements: string[];
  ariaImprovements: string[];
  whyThisWorks: string;
  regressionRisk: RegressionRisk[];
  testingSteps: string[];
  characteristics: FixCharacteristics;
}

const TEMPLATES: Record<string, GuidanceTemplate> = {
  "button-name": {
    rootCause:
      "An icon-only control was built without a text label. The icon communicates the " +
      "action visually, and nothing communicates it programmatically. This is almost " +
      "always a shared component — an IconButton or a toolbar primitive — so the same " +
      "defect appears everywhere that component is used, and fixing the component fixes " +
      "every occurrence at once.",
    problem:
      "This button exposes no accessible name. Screen reader users hear only \"button\", " +
      "with nothing to indicate what it does, and voice-control users have no phrase to " +
      "speak to activate it. Icon-only buttons are the usual cause: the icon conveys " +
      "meaning visually and nothing to assistive technology.",
    criteria: [
      {
        id: "4.1.2",
        relevance:
          "Requires that every user interface component exposes a name, role, and value " +
          "to assistive technology. A button with no name fails the name requirement.",
      },
      {
        id: "2.4.6",
        relevance:
          "Requires labels to DESCRIBE purpose. This is the criterion a generic name " +
          "fails: \"Click here\" satisfies 4.1.2 because a name exists, but still fails " +
          "here because it does not describe what the button does.",
      },
    ],
    wcagExplanation:
      "WCAG treats a control's NAME as information, not decoration. Someone who cannot " +
      "see the icon must still be able to tell what the control does before activating " +
      "it — and someone using voice control must have a word to say. An unnamed button " +
      "denies both.",
    developerExplanation:
      "The browser computes an accessible name from a defined precedence chain: " +
      "aria-labelledby, then aria-label, then the element's own text content, then " +
      "title. An icon-only button provides none of these — an <svg> contributes nothing " +
      "unless it carries a <title> — so the computed name is the empty string. That is " +
      "what the scanner reports, and it is what a screen reader announces.",
    examples: {
      html:
        `<!-- Icon-only: the label carries the meaning -->\n` +
        `<button type="button" aria-label="Close dialog">\n` +
        `  <svg aria-hidden="true" focusable="false"><use href="#icon-x" /></svg>\n` +
        `</button>\n\n` +
        `<!-- Visible label: no ARIA needed at all -->\n` +
        `<button type="button">\n` +
        `  <svg aria-hidden="true" focusable="false"><use href="#icon-x" /></svg>\n` +
        `  Close\n` +
        `</button>`,
      react:
        `// Fix the shared component once and every usage is fixed.\n` +
        `// Requiring the prop in TypeScript prevents the defect returning.\n` +
        `type IconButtonProps = {\n` +
        `  label: string;              // required — not optional\n` +
        `  icon: React.ReactNode;\n` +
        `  onClick: () => void;\n` +
        `};\n\n` +
        `export function IconButton({ label, icon, onClick }: IconButtonProps) {\n` +
        `  return (\n` +
        `    <button type="button" onClick={onClick} aria-label={label}>\n` +
        `      <span aria-hidden="true">{icon}</span>\n` +
        `    </button>\n` +
        `  );\n` +
        `}`,
      nextjs:
        `"use client";\n\n` +
        `// App Router note: a button with an onClick handler needs a client boundary.\n` +
        `// Without "use client" this is a build error, not an accessibility problem —\n` +
        `// but it is why a fix copied from a plain React example fails to compile here.\n` +
        `import { useTranslations } from "next-intl";\n\n` +
        `export function CloseButton({ onClose }: { onClose: () => void }) {\n` +
        `  const t = useTranslations("dialog");\n` +
        `  // Localise the accessible name exactly like visible copy — aria-label is\n` +
        `  // routinely missed by translation pipelines.\n` +
        `  return (\n` +
        `    <button type="button" onClick={onClose} aria-label={t("closeDialog")}>\n` +
        `      <XIcon aria-hidden="true" />\n` +
        `    </button>\n` +
        `  );\n` +
        `}`,
    },
    cssImprovements: [
      "Do not use `display: none` or `visibility: hidden` to hide label text — both remove it from the accessibility tree, so the name disappears with it.",
      "Where a visible label is undesirable, a visually-hidden utility class (clip-path/1px technique) keeps the text available to screen readers AND to voice control, which `aria-label` does not.",
      "Ensure the button meets the 24×24 CSS pixel minimum for SC 2.5.8 Target Size; icon-only buttons frequently fail this because the icon is sized instead of the control.",
    ],
    ariaImprovements: [
      "Prefer native text content over ARIA. A `<button>` with visible text needs no attributes at all, and cannot fall out of sync.",
      "Where the label already exists in the DOM, use `aria-labelledby` pointing at it rather than duplicating the string in `aria-label`.",
      "Add `aria-hidden=\"true\"` to the decorative icon so its title or glyph is not announced alongside the label.",
      "Add `focusable=\"false\"` to inline `<svg>` — some browsers place SVG elements in the tab order otherwise.",
      "Do NOT add `role=\"button\"` to a `<button>`; the role is already correct and the attribute is redundant.",
    ],
    fixedCode: () =>
      `// Icon-only button — the icon is decorative, the label carries the meaning\n` +
      `<button type="button" onClick={onClose} aria-label="Close dialog">\n` +
      `  <XIcon aria-hidden="true" />\n` +
      `</button>\n\n` +
      `// Preferred where space allows: a visible label needs no ARIA at all\n` +
      `<button type="button" onClick={onClose}>\n` +
      `  <XIcon aria-hidden="true" />\n` +
      `  <span>Close</span>\n` +
      `</button>`,
    whyThisWorks:
      "`aria-label` supplies an accessible name where no visible text exists, so the " +
      "accessibility tree reports \"Close dialog, button\" instead of \"button\". Marking " +
      "the icon `aria-hidden=\"true\"` stops the icon font or SVG title from being " +
      "announced alongside the label, which would otherwise produce a duplicated or " +
      "confusing name. The second form is preferred because a visible text label serves " +
      "every user — including people with cognitive disabilities who benefit from " +
      "explicit labels — and it cannot drift out of sync the way an ARIA attribute can.",
    regressionRisk: [
      {
        risk:
          "Adding `aria-label` to a button that ALREADY has visible text overrides that " +
          "text. If the label does not begin with the visible words, voice-control users " +
          "who say what they see will fail to activate the control — introducing a " +
          "violation of SC 2.5.3 Label in Name while fixing SC 4.1.2.",
        mitigation:
          "Only use `aria-label` when there is no visible text. Where both exist, make " +
          "the accessible name start with the visible label.",
      },
      {
        risk:
          "`aria-label` is not translated by the i18n pipeline in most setups, so a " +
          "localised UI can ship English accessible names.",
        mitigation:
          "Pass the label through the translation function, exactly like visible copy.",
      },
      {
        risk:
          "Applying a generic label such as \"Button\" or \"Click here\" clears the automated " +
          "check while leaving the control just as unusable.",
        mitigation:
          "The name must describe the ACTION and its target: \"Close dialog\", not \"Close\".",
      },
    ],
    testingSteps: [
      "Re-run the automated scan and confirm `button-name` no longer reports on this element.",
      "Inspect the element in DevTools → Accessibility pane and verify the computed Name is the intended text.",
      "Traverse to the button with Tab using VoiceOver (macOS) or NVDA (Windows) and confirm it announces as \"<name>, button\".",
      "With Voice Control or Voice Access, speak \"Click <visible label>\" and confirm the button activates.",
      "If the button has visible text, confirm the accessible name starts with that text (SC 2.5.3).",
      "Switch the interface to a second locale and confirm the accessible name is translated.",
    ],
    characteristics: {
      // An IDE cannot know that this button closes a dialog rather than submitting a
      // form, so it can scaffold the attribute but must not author the text.
      requiresHumanContent: true,
      requiresDesignDecision: false,
      contextDependent: true,
      hasSingleCorrectFix: false,
    },
  },

  "image-alt": {
    rootCause:
      "An image was rendered without an `alt` attribute — usually because the value comes " +
      "from a CMS field or prop that is optional, so the omission never surfaces at " +
      "build time. Making the field required at the type or schema level is what stops " +
      "it recurring.",
    problem:
      "This image has no `alt` attribute, so screen readers fall back to announcing the " +
      "file name — or nothing at all. Any information the image carries is unavailable " +
      "to users who cannot see it.",
    criteria: [
      {
        id: "1.1.1",
        relevance:
          "Requires a text alternative for non-text content that serves an equivalent purpose.",
      },
    ],
    wcagExplanation:
      "Anything conveying information visually must have a text equivalent, so a person " +
      "who cannot see it receives the same information by another route. An image with " +
      "no alternative simply removes that information for those users.",
    developerExplanation:
      "With no `alt` attribute, assistive technology falls back to the file name or " +
      "skips the element unpredictably. `alt=\"\"` is NOT equivalent to a missing " +
      "attribute: an empty value explicitly marks the image decorative and removes it " +
      "from the accessibility tree, which is a deliberate statement rather than an " +
      "omission.",
    examples: {
      html:
        `<!-- Informative: the text replaces the information the image carries -->\n` +
        `<img src="/chart.png" alt="Accessibility score rose from 72 to 94 between January and June" />\n\n` +
        `<!-- Decorative: an empty alt removes it from the accessibility tree -->\n` +
        `<img src="/divider.svg" alt="" />`,
      react:
        `// Make alt required so an omission is a type error, not a runtime defect.\n` +
        `type FigureProps = {\n` +
        `  src: string;\n` +
        `  alt: string;   // "" is valid and means decorative — but must be explicit\n` +
        `};\n\n` +
        `export function Figure({ src, alt }: FigureProps) {\n` +
        `  return <img src={src} alt={alt} />;\n` +
        `}`,
      nextjs:
        `import Image from "next/image";\n\n` +
        `// next/image reserves layout space from width/height (or fill). That matters\n` +
        `// for accessibility as well as performance: unreserved space causes layout\n` +
        `// shift, which disorients magnifier users and anyone with vestibular sensitivity.\n` +
        `<Image\n` +
        `  src="/chart.png"\n` +
        `  alt="Accessibility score rose from 72 to 94 between January and June"\n` +
        `  width={640}\n` +
        `  height={360}\n` +
        `/>`,
    },
    cssImprovements: [
      "Avoid CSS background images for content that carries meaning — they have no alt mechanism and are invisible to assistive technology.",
      "Reserve layout space with width/height or aspect-ratio so loading does not shift content under a magnifier user's viewport.",
    ],
    ariaImprovements: [
      "Prefer the native `alt` attribute over `aria-label` on `<img>` — it is better supported and is what the element is designed for.",
      "For an inline `<svg>` that conveys meaning, use `role=\"img\"` with `aria-label`, since `alt` does not apply to SVG.",
      "Do not add `role=\"presentation\"` alongside `alt=\"\"` — the empty alt already achieves it.",
    ],
    fixedCode: () =>
      `// Informative image — the alt text replaces the information the image carries\n` +
      `<img src="/chart.png" alt="Accessibility score rose from 72 to 94 between January and June" />\n\n` +
      `// Decorative image — an empty alt removes it from the accessibility tree\n` +
      `<img src="/divider.svg" alt="" />`,
    whyThisWorks:
      "An informative `alt` conveys the image's MEANING rather than describing its " +
      "appearance, so a screen reader user receives the same information a sighted user " +
      "does. An empty `alt=\"\"` is not the same as a missing one: it explicitly marks the " +
      "image decorative so assistive technology skips it, whereas a missing attribute " +
      "leaves the behaviour to the user agent.",
    regressionRisk: [
      {
        risk:
          "Describing appearance instead of meaning (\"chart\", \"photo\") passes the " +
          "automated check while conveying nothing.",
        mitigation:
          "Ask what a sighted user learns from the image, and write that sentence.",
      },
      {
        risk:
          "Marking an informative image as decorative with `alt=\"\"` silently removes " +
          "content, and no automated tool will flag it.",
        mitigation:
          "Use `alt=\"\"` only when the surrounding text already conveys the information.",
      },
    ],
    testingSteps: [
      "Re-run the automated scan and confirm `image-alt` no longer reports.",
      "Disable images in the browser and confirm the page still communicates the same information.",
      "Navigate with a screen reader and confirm decorative images are skipped entirely.",
    ],
    characteristics: {
      // Whether an image is informative or decorative — and what it conveys — cannot be
      // determined from markup. This is the least automatable fix in accessibility.
      requiresHumanContent: true,
      requiresDesignDecision: false,
      contextDependent: true,
      hasSingleCorrectFix: false,
    },
  },
};

/**
 * Build structured guidance for a violation.
 *
 * Returns null for a rule with no template rather than emitting a generic placeholder.
 * Vague advice in a remediation report costs a developer time and teaches them to
 * distrust the tool.
 */
export function buildRemediationGuidance(
  ruleId: string,
  currentCode: string,
): RemediationGuidance | null {
  const template = TEMPLATES[ruleId];
  if (!template) return null;

  // Any criterion that fails validation is dropped, not guessed at.
  const wcag = template.criteria
    .map(({ id, relevance }) => reference(id, relevance))
    .filter((ref): ref is WcagReference => ref !== null);

  return {
    ruleId,
    rootCause: template.rootCause,
    problem: template.problem,
    wcagExplanation: template.wcagExplanation,
    developerExplanation: template.developerExplanation,
    wcag,
    currentCode,
    fixedCode: template.fixedCode(currentCode),
    examples: template.examples,
    cssImprovements: template.cssImprovements,
    ariaImprovements: template.ariaImprovements,
    whyThisWorks: template.whyThisWorks,
    regressionRisk: template.regressionRisk,
    testingSteps: template.testingSteps,
    // Derived, so the score and the stated reasoning can never disagree.
    confidence: assessConfidence(template.characteristics),
  };
}

/** Rules with authored guidance, for coverage reporting. */
export function supportedRules(): string[] {
  return Object.keys(TEMPLATES);
}
