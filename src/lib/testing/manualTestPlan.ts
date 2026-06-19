/**
 * WHY: ~60% of WCAG 2.2 A/AA criteria cannot be fully determined by automation.
 *      Structured manual test plans close the gap with human-in-the-loop verification.
 * WHAT: Pure buildTestPlan() function that produces a prioritized list of manual test
 *       items with narration evidence bindings — no Prisma, no server imports.
 * HOW: Partitions WCAG criteria into automation-covered vs manual-needed, binds relevant
 *      accessibility-tree evidence from ScreenReaderSnapshot, orders by litigation risk.
 */

import {
  WCAG_CRITERIA,
  MANUAL_ONLY_CRITERIA,
  getLitigationWeight,
  type WcagCriterion,
} from "@/lib/wcag/criteria";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ManualVerdict = "pass" | "fail" | "na" | "untested";

export interface ManualTestEvidence {
  kind: "narration" | "none";
  /** Indices into ScreenReaderSnapshot.steps for relevant evidence */
  steps?: number[];
  note?: string;
}

export interface ManualTestItem {
  criterion: string;
  level: "A" | "AA";
  title: string;
  principle: string;
  /** Why this criterion requires manual testing */
  why: string;
  /** AI-drafted or static fallback guidance */
  guidance: string;
  /** Whether guidance was AI-generated (false = static fallback) */
  aiGenerated: boolean;
  /** Narration evidence binding */
  evidence: ManualTestEvidence;
  verdict: ManualVerdict;
  note: string | null;
  attestedBy: string | null;
  attestedAt: string | null;
}

export interface ManualTestPlan {
  version: 1;
  scanId: string;
  generatedAt: string;
  snapshotRef: { capturedAt: string; totalElements: number } | null;
  items: ManualTestItem[];
}

/** Minimal snapshot shape for plan building (avoids importing Page type) */
export interface SnapshotForPlan {
  capturedAt: string;
  totalElements: number;
  steps: Array<{
    index: number;
    role: string;
    name: string;
    isLandmark?: boolean;
    isInteractive?: boolean;
  }>;
}

// ── Static guidance fallbacks ─────────────────────────────────────────────────

const STATIC_GUIDANCE: Record<string, string> = {
  "1.1.1": "Verify all images have alt text that conveys meaning (not just filename). Decorative images should have empty alt=\"\". Complex images need detailed descriptions.",
  "1.3.1": "Check that visual structure (headings, lists, tables, form groups) is conveyed programmatically. Use the accessibility tree to verify semantic roles match visual presentation.",
  "1.3.2": "Tab through the page and verify the reading/focus order matches the visual layout. Content should be understandable when CSS is disabled.",
  "1.3.3": "Verify instructions don't rely solely on sensory characteristics (shape, color, size, position, sound). E.g., 'click the round button' should also mention the label.",
  "1.4.1": "Check that color is not the only means of conveying information. Error states, required fields, and links should have non-color indicators.",
  "1.4.5": "Verify that text is rendered as HTML text, not as images of text (except logos). Users should be able to resize and restyle.",
  "2.1.1": "Navigate the entire page using only keyboard (Tab, Shift+Tab, Enter, Space, Arrow keys). All interactive elements must be reachable and operable.",
  "2.1.2": "While keyboard-navigating, verify you can always move focus away from any component. No element should trap keyboard focus.",
  "2.4.3": "Tab through all interactive elements and verify the focus sequence is logical and matches the visual flow. Focus should not jump unexpectedly.",
  "2.4.4": "Read each link text in isolation — can you determine its purpose? Links like 'click here' or 'read more' without context fail this criterion.",
  "2.4.6": "Verify headings describe the content beneath them and form labels clearly identify their input. Check heading hierarchy (h1→h2→h3) is logical.",
  "2.4.7": "Tab through the page and verify every focused element has a visible focus indicator (outline, ring, highlight). Focus must never disappear.",
  "2.5.3": "For controls with visible text labels, verify the accessible name contains the visible label text. Screen reader users should hear what they see.",
  "3.1.1": "Verify the page has a lang attribute on <html> matching the primary content language. Check with accessibility tree inspection.",
  "3.1.2": "Identify any passages in a different language from the page default. Verify they have lang attributes (e.g., <span lang=\"fr\">).",
  "3.2.1": "Move focus to each interactive element WITHOUT activating it. Verify no unexpected changes occur (page navigation, popup, form submission) on focus alone.",
  "3.2.2": "Change the value of form controls (select, radio, checkbox, text input). Verify no unexpected navigation or context change happens without explicit user action.",
  "3.2.3": "Compare navigation menus across multiple pages. Verify repeated navigation appears in the same relative order on each page.",
  "3.2.4": "Check that components with the same function across pages have consistent labels (e.g., 'Search' is always 'Search', not sometimes 'Find').",
  "3.3.1": "Trigger form validation errors. Verify errors are identified in text (not color alone) and clearly describe what went wrong.",
  "3.3.2": "Check that form fields have visible labels and any required format/constraints are communicated before submission (e.g., 'Date: MM/DD/YYYY').",
  "3.3.3": "After triggering a validation error, verify the system suggests corrections where possible (e.g., 'Did you mean...?' for email typos).",
  "3.3.4": "For pages involving legal/financial/data transactions, verify users can review, correct, and confirm before final submission. Check for undo capability.",
  "4.1.2": "Inspect custom widgets (dropdowns, tabs, accordions, dialogs) with the accessibility tree. Verify each has a name, role, and state/value communicated programmatically.",
};

const DEFAULT_GUIDANCE = "Test this criterion manually by following WCAG 2.1 understanding documents. Verify conformance through direct observation and interaction.";

// ── Why explanations ──────────────────────────────────────────────────────────

const MANUAL_WHY: Record<string, string> = {
  "1.1.1": "Automation can detect missing alt text but cannot determine if the alt text is meaningful, accurate, or appropriate for context.",
  "1.3.1": "Automation checks for ARIA roles but cannot determine if the semantic structure accurately represents the visual relationships.",
  "1.3.2": "DOM order vs. visual order mismatches require human judgment about whether the sequence conveys meaning correctly.",
  "1.3.3": "Instructions referencing sensory characteristics (color, shape, position) require human reading comprehension to identify.",
  "1.4.1": "Color-only indicators require human judgment to determine if sufficient non-color alternatives exist in context.",
  "1.4.5": "Distinguishing meaningful text rendered as images from logos/branding requires human visual assessment.",
  "2.1.1": "Full keyboard operability requires testing every interactive workflow path — automation cannot exercise all user journeys.",
  "2.1.2": "Keyboard traps are state-dependent and require sequential keyboard navigation through all possible paths.",
  "2.4.3": "Whether focus order is 'logical' depends on content meaning and visual layout — inherently a human judgment.",
  "2.4.4": "Link purpose 'in context' requires human reading comprehension of surrounding text and link text combined.",
  "2.4.6": "Whether headings and labels are 'descriptive' is a quality judgment that requires human language comprehension.",
  "2.4.7": "Focus visibility 'in context' depends on background colors, contrast, and visual design — requires human eyes.",
  "2.5.3": "Verifying accessible name includes the visible label text requires comparing what's seen with what's announced.",
  "3.1.1": "Correct language identification requires human knowledge of the actual content language.",
  "3.1.2": "Identifying foreign-language passages and verifying their lang attributes requires human language recognition.",
  "3.2.1": "Unexpected context changes on focus are behavioral and require real-time human observation.",
  "3.2.2": "Unexpected changes on input require testing actual interaction sequences and judging 'unexpectedness'.",
  "3.2.3": "Cross-page navigation consistency requires comparing multiple pages — automation typically scans one page at a time.",
  "3.2.4": "Consistent identification across pages requires human judgment about functional equivalence.",
  "3.3.1": "Error message clarity and identification quality require human language comprehension.",
  "3.3.2": "Whether labels and instructions are sufficient for the target audience is a human judgment.",
  "3.3.3": "Quality and helpfulness of error suggestions requires human evaluation.",
  "3.3.4": "Verifying reversibility/confirmation flows exist for critical actions requires end-to-end workflow testing.",
  "4.1.2": "Custom widget name/role/value accuracy requires testing with assistive technology patterns — automation checks syntax but not semantic correctness.",
};

const DEFAULT_WHY = "This criterion was not covered by automated scanning and requires human verification to determine conformance.";

// ── Evidence binding ──────────────────────────────────────────────────────────

function bindEvidence(criterion: string, snapshot: SnapshotForPlan | null): ManualTestEvidence {
  if (!snapshot || !snapshot.steps.length) {
    return { kind: "none" };
  }

  const steps = snapshot.steps;

  switch (criterion) {
    // Alt text — evidence from image roles
    case "1.1.1": {
      const imageSteps = steps
        .filter((s) => s.role === "img" || s.role === "image")
        .map((s) => s.index);
      return imageSteps.length > 0
        ? { kind: "narration", steps: imageSteps, note: `${imageSteps.length} image(s) found for alt text review` }
        : { kind: "none" };
    }

    // Semantics — evidence from landmarks and headings
    case "1.3.1": {
      const semanticSteps = steps
        .filter((s) => s.isLandmark || ["heading", "list", "table", "form"].includes(s.role))
        .map((s) => s.index);
      return semanticSteps.length > 0
        ? { kind: "narration", steps: semanticSteps, note: `${semanticSteps.length} semantic element(s) for structure review` }
        : { kind: "none" };
    }

    // Focus order — all interactive elements in DOM order
    case "2.4.3":
    case "2.1.1":
    case "2.1.2": {
      const interactiveSteps = steps
        .filter((s) => s.isInteractive)
        .map((s) => s.index);
      return interactiveSteps.length > 0
        ? { kind: "narration", steps: interactiveSteps, note: `${interactiveSteps.length} interactive element(s) — verify focus sequence` }
        : { kind: "none" };
    }

    // Link purpose — all link elements
    case "2.4.4": {
      const linkSteps = steps
        .filter((s) => s.role === "link")
        .map((s) => s.index);
      return linkSteps.length > 0
        ? { kind: "narration", steps: linkSteps, note: `${linkSteps.length} link(s) for purpose review` }
        : { kind: "none" };
    }

    // Headings and labels
    case "2.4.6": {
      const headingSteps = steps
        .filter((s) => s.role === "heading")
        .map((s) => s.index);
      return headingSteps.length > 0
        ? { kind: "narration", steps: headingSteps, note: `${headingSteps.length} heading(s) for descriptiveness review` }
        : { kind: "none" };
    }

    // Label in name — buttons and links
    case "2.5.3": {
      const labelSteps = steps
        .filter((s) => s.role === "button" || s.role === "link")
        .map((s) => s.index);
      return labelSteps.length > 0
        ? { kind: "narration", steps: labelSteps, note: `${labelSteps.length} labeled control(s) — verify name matches visible text` }
        : { kind: "none" };
    }

    // Name, Role, Value — custom widgets
    case "4.1.2": {
      const widgetSteps = steps
        .filter((s) => s.isInteractive && !["link", "button", "textbox"].includes(s.role))
        .map((s) => s.index);
      return widgetSteps.length > 0
        ? { kind: "narration", steps: widgetSteps, note: `${widgetSteps.length} custom widget(s) — verify name/role/value` }
        : { kind: "none" };
    }

    default:
      return { kind: "none" };
  }
}

// ── Main: buildTestPlan ───────────────────────────────────────────────────────

/**
 * Builds a prioritized manual test plan from automated scan coverage and
 * an optional accessibility-tree snapshot for evidence binding.
 *
 * @param automationCoveredCriteria - Set of criterion IDs that the automated scan reported on
 * @param scanId - The source scan ID
 * @param snapshot - Optional narration snapshot for evidence binding
 */
export function buildTestPlan(
  automationCoveredCriteria: Set<string>,
  scanId: string,
  snapshot: SnapshotForPlan | null = null,
): ManualTestPlan {
  // Filter to A + AA only (drop AAA)
  const eligible = WCAG_CRITERIA.filter((c) => c.level === "A" || c.level === "AA");

  // A criterion needs manual testing if:
  // 1. It's in MANUAL_ONLY_CRITERIA (always needs human verification), OR
  // 2. It was NOT covered by automation (axe didn't report on it)
  const manualItems: ManualTestItem[] = eligible
    .filter((c) => MANUAL_ONLY_CRITERIA.has(c.criterion) || !automationCoveredCriteria.has(c.criterion))
    .map((c) => ({
      criterion: c.criterion,
      level: c.level,
      title: c.title,
      principle: c.principle,
      why: MANUAL_WHY[c.criterion] ?? DEFAULT_WHY,
      guidance: STATIC_GUIDANCE[c.criterion] ?? DEFAULT_GUIDANCE,
      aiGenerated: false,
      evidence: bindEvidence(c.criterion, snapshot),
      verdict: "untested" as ManualVerdict,
      note: null,
      attestedBy: null,
      attestedAt: null,
    }));

  // Sort by litigation risk weight (highest first)
  manualItems.sort((a, b) => getLitigationWeight(b.criterion) - getLitigationWeight(a.criterion));

  return {
    version: 1,
    scanId,
    generatedAt: new Date().toISOString(),
    snapshotRef: snapshot
      ? { capturedAt: snapshot.capturedAt, totalElements: snapshot.totalElements }
      : null,
    items: manualItems,
  };
}
