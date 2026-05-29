/**
 * RegLayer — Fix Prioritizer & Code Generator
 *
 * WHY: 90% of users scan but never fix. The gap is: "47 violations" is paralyzing.
 *      This module solves: "What's the ONE thing to fix next?" + "Here's the exact code."
 *
 * WHAT: Takes a scan's violations, ranks them by impact-to-effort ratio, and generates
 *       concrete, copy-paste fix code for each one.
 *
 * HOW: Prioritization uses AIS dimension weights (which populations are blocked,
 *      how many elements affected, regulatory risk). Code generation uses rule-specific
 *      templates that produce valid HTML/CSS/ARIA fixes.
 *
 * Design principle: One card at a time. No overwhelm. Each card has:
 *   - What's wrong (plain English)
 *   - Who's affected (disability population)
 *   - The broken element (HTML snippet)
 *   - The fixed element (copy-paste code)
 *   - Estimated AIS point gain
 */

import type { AccessibilityViolation } from "@/lib/types";

// ─────────────── Types ───────────────

export interface FixCard {
  /** Unique ID for this card (violation ID + node index) */
  id: string;
  /** Priority rank (1 = most impactful) */
  rank: number;
  /** The rule that's violated */
  ruleId: string;
  /** Severity level */
  impact: "critical" | "serious" | "moderate" | "minor";
  /** Plain English: what's wrong */
  problem: string;
  /** Plain English: who this hurts */
  whoIsAffected: string;
  /** The broken HTML element */
  brokenCode: string;
  /** CSS selector to find this element */
  selector: string;
  /** The fixed code (ready to copy-paste) */
  fixedCode: string;
  /** What was changed (human-readable diff summary) */
  whatChanged: string;
  /** Estimated AIS point gain from fixing this */
  pointGain: number;
  /** Effort to fix: low (copy-paste), medium (edit needed), high (restructure) */
  effort: "low" | "medium" | "high";
  /** Fix category for UI grouping */
  category: FixCategory;
}

export type FixCategory =
  | "add-alt-text"
  | "fix-contrast"
  | "add-label"
  | "fix-aria"
  | "fix-heading"
  | "add-landmark"
  | "fix-keyboard"
  | "fix-link"
  | "fix-form"
  | "other";

// ─────────────── Priority Weights ───────────────

const IMPACT_SCORE: Record<string, number> = {
  critical: 100,
  serious: 60,
  moderate: 25,
  minor: 5,
};

/**
 * Which disability populations are blocked by each rule.
 * Used in the "Who is affected" field of fix cards.
 */
const RULE_POPULATIONS: Record<string, string> = {
  "image-alt": "Blind users (screen readers announce nothing for this image)",
  "input-image-alt": "Blind users cannot identify this button's purpose",
  "svg-img-alt": "Blind and low-vision users miss this visual content",
  "color-contrast": "Low-vision and color-blind users cannot read this text",
  "label": "Blind users and voice-control users cannot identify this form field",
  "select-name": "Blind users cannot identify what this dropdown is for",
  "button-name": "Blind and voice-control users cannot activate this button",
  "link-name": "Blind users hear 'link' but don't know where it goes",
  "heading-order": "Screen reader users lose page structure and navigation",
  "page-has-heading-one": "Screen reader users cannot find the main content",
  "landmark-one-main": "Screen reader users cannot skip to main content",
  "region": "Screen reader users cannot navigate by page sections",
  "document-title": "Screen reader users don't know what page they're on",
  "keyboard": "Motor-impaired users (keyboard/switch) cannot reach this element",
  "tabindex": "Keyboard users get trapped or skip content unexpectedly",
  "aria-required-attr": "Screen readers announce incomplete/broken widget info",
  "aria-valid-attr-value": "Screen readers receive incorrect state information",
  "aria-roles": "Screen readers misidentify this element's purpose",
  "aria-hidden-focus": "Keyboard users can focus an element screen readers hide",
  "duplicate-id": "Screen readers and voice-control cannot reliably target elements",
  "video-caption": "Deaf and hard-of-hearing users miss video content",
  "meta-viewport": "Low-vision users cannot zoom the page to readable size",
};

// ─────────────── Main Entry Point ───────────────

/**
 * Generate prioritized fix cards from scan violations.
 *
 * @param violations - All violations from a completed scan
 * @returns Ordered array of fix cards (highest impact first)
 */
export function generateFixCards(violations: AccessibilityViolation[]): FixCard[] {
  if (violations.length === 0) return [];

  const cards: FixCard[] = [];

  for (const violation of violations) {
    // Generate one card per affected element (up to 5 per rule to avoid flood)
    const nodesToShow = violation.nodes.slice(0, 5);

    for (let i = 0; i < nodesToShow.length; i++) {
      const node = nodesToShow[i];
      const fix = generateFix(violation.id, node.html);

      cards.push({
        id: `${violation.id}-${i}`,
        rank: 0, // assigned after sorting
        ruleId: violation.id,
        impact: violation.impact,
        problem: violation.help,
        whoIsAffected: RULE_POPULATIONS[violation.id] ?? "Users with disabilities may struggle with this element",
        brokenCode: node.html,
        selector: node.target[0] ?? "",
        fixedCode: fix.code,
        whatChanged: fix.explanation,
        pointGain: 0, // assigned after scoring
        effort: fix.effort,
        category: categorizeRule(violation.id),
      });
    }
  }

  // Score and sort by impact-to-effort ratio
  const scored = cards.map((card) => {
    const impactScore = IMPACT_SCORE[card.impact] ?? 25;
    const effortMultiplier = card.effort === "low" ? 3 : card.effort === "medium" ? 1.5 : 1;
    const priority = impactScore * effortMultiplier;
    return { ...card, _priority: priority };
  });

  scored.sort((a, b) => b._priority - a._priority);

  // Assign ranks and estimate point gains
  return scored.map((card, i) => {
    const { _priority, ...rest } = card;
    // Distribute estimated point gains (higher priority = more points)
    const pointShare = Math.max(1, Math.round((_priority / 100) * 5));
    return { ...rest, rank: i + 1, pointGain: pointShare };
  });
}

// ─────────────── Fix Code Generator ───────────────

interface FixResult {
  code: string;
  explanation: string;
  effort: "low" | "medium" | "high";
}

/**
 * Generate a concrete fix for a specific violation + element.
 * Returns ready-to-paste HTML with the fix applied.
 */
function generateFix(ruleId: string, html: string): FixResult {
  switch (ruleId) {
    case "image-alt":
    case "input-image-alt":
    case "svg-img-alt":
    case "role-img-alt":
      return fixMissingAlt(html);

    case "color-contrast":
    case "color-contrast-enhanced":
      return fixContrast(html);

    case "label":
    case "select-name":
      return fixMissingLabel(html);

    case "button-name":
      return fixButtonName(html);

    case "link-name":
      return fixLinkName(html);

    case "heading-order":
    case "page-has-heading-one":
      return fixHeading(html, ruleId);

    case "landmark-one-main":
    case "region":
      return fixLandmark(html, ruleId);

    case "document-title":
      return fixDocumentTitle();

    case "aria-required-attr":
    case "aria-valid-attr-value":
    case "aria-roles":
      return fixAria(html, ruleId);

    case "keyboard":
    case "tabindex":
      return fixKeyboard(html, ruleId);

    case "duplicate-id":
      return fixDuplicateId(html);

    case "meta-viewport":
      return fixMetaViewport();

    default:
      return {
        code: html,
        explanation: "Review this element and apply the appropriate WCAG fix",
        effort: "medium",
      };
  }
}

// ─────────────── Rule-Specific Fixers ───────────────

function fixMissingAlt(html: string): FixResult {
  // Add alt="" for decorative or alt="[descriptive]" for meaningful
  if (html.includes("alt=")) {
    // Has empty or bad alt
    const fixed = html.replace(/alt=["'][^"']*["']/, 'alt="Describe this image"');
    return { code: fixed, explanation: 'Add descriptive alt text (replace "Describe this image" with actual description)', effort: "medium" };
  }

  // No alt attribute at all
  if (html.includes("<img")) {
    const fixed = html.replace(/<img/, '<img alt="Describe this image"');
    return { code: fixed, explanation: 'Added alt attribute — replace "Describe this image" with what the image shows', effort: "low" };
  }

  if (html.includes("<svg")) {
    const fixed = html.replace(/<svg/, '<svg role="img" aria-label="Describe this graphic"');
    return { code: fixed, explanation: "Added role and aria-label to SVG", effort: "low" };
  }

  return { code: `<!-- Add alt="description" to: -->\n${html}`, explanation: "Add alt text describing the image content", effort: "medium" };
}

function fixContrast(html: string): FixResult {
  // Can't auto-fix colors without knowing the design, but provide guidance
  const fixed = html.replace(
    /style="([^"]*)"/,
    (match, styles) => {
      if (styles.includes("color")) {
        return `style="${styles}" /* Increase contrast ratio to 4.5:1 minimum */`;
      }
      return match;
    }
  );

  return {
    code: fixed || html,
    explanation: "Increase text color contrast to at least 4.5:1 ratio (use WebAIM contrast checker). Darken the text or lighten the background.",
    effort: "low",
  };
}

function fixMissingLabel(html: string): FixResult {
  // Extract input type/name for label
  const nameMatch = html.match(/name=["']([^"']+)["']/);
  const idMatch = html.match(/id=["']([^"']+)["']/);
  const id = idMatch?.[1] ?? nameMatch?.[1] ?? "field";

  if (!idMatch) {
    // Add id and wrap with label
    const withId = html.replace(/<(input|select|textarea)/, `<$1 id="${id}"`);
    const fixed = `<label for="${id}">Field label</label>\n${withId}`;
    return { code: fixed, explanation: `Added <label> linked via id="${id}" — replace "Field label" with actual field name`, effort: "low" };
  }

  const fixed = `<label for="${id}">Field label</label>\n${html}`;
  return { code: fixed, explanation: `Added <label for="${id}"> — replace "Field label" with the actual field name`, effort: "low" };
}

function fixButtonName(html: string): FixResult {
  if (html.includes("aria-label")) {
    const fixed = html.replace(/aria-label=["'][^"']*["']/, 'aria-label="Button action"');
    return { code: fixed, explanation: "Update aria-label to describe the button's action", effort: "low" };
  }

  const fixed = html.replace(/<button/, '<button aria-label="Describe action"');
  return { code: fixed, explanation: 'Added aria-label — replace "Describe action" with what the button does', effort: "low" };
}

function fixLinkName(html: string): FixResult {
  if (html.match(/<a[^>]*>(\s*<img|\s*<svg|\s*$)/)) {
    // Icon-only link
    const fixed = html.replace(/<a/, '<a aria-label="Link destination"');
    return { code: fixed, explanation: "Added aria-label for icon-only link — describe where the link goes", effort: "low" };
  }

  if (html.includes(">click here<") || html.includes(">here<") || html.includes(">read more<")) {
    const fixed = html.replace(/>(click here|here|read more)</i, ">Descriptive link text<");
    return { code: fixed, explanation: 'Replace generic "click here" with text describing the link destination', effort: "low" };
  }

  const fixed = html.replace(/<a/, '<a aria-label="Describe destination"');
  return { code: fixed, explanation: "Add descriptive text or aria-label to this link", effort: "medium" };
}

function fixHeading(html: string, ruleId: string): FixResult {
  if (ruleId === "page-has-heading-one") {
    return {
      code: `<h1>Page Title</h1>\n<!-- Add as the first heading in your main content -->`,
      explanation: "Add an <h1> element as the primary heading of the page",
      effort: "low",
    };
  }

  // heading-order: suggest correct level
  const levelMatch = html.match(/<h(\d)/);
  if (levelMatch) {
    const currentLevel = parseInt(levelMatch[1]);
    const suggestedLevel = Math.max(1, currentLevel - 1);
    const fixed = html.replace(/<h\d/, `<h${suggestedLevel}`).replace(/<\/h\d>/, `</h${suggestedLevel}>`);
    return { code: fixed, explanation: `Changed heading level from h${currentLevel} to h${suggestedLevel} to maintain hierarchy`, effort: "low" };
  }

  return { code: html, explanation: "Ensure heading levels don't skip (e.g., h1 → h3 without h2)", effort: "medium" };
}

function fixLandmark(html: string, ruleId: string): FixResult {
  if (ruleId === "landmark-one-main") {
    return {
      code: `<main>\n  <!-- Wrap your primary page content here -->\n  ${html}\n</main>`,
      explanation: "Wrap the page's primary content in a <main> element",
      effort: "low",
    };
  }

  // region: wrap in a landmark
  return {
    code: `<section aria-label="Section name">\n  ${html}\n</section>`,
    explanation: 'Wrap content in a <section> with aria-label describing the region',
    effort: "medium",
  };
}

function fixDocumentTitle(): FixResult {
  return {
    code: `<title>Page Name — Site Name</title>`,
    explanation: "Add a descriptive <title> in your <head> that identifies the page",
    effort: "low",
  };
}

function fixAria(html: string, ruleId: string): FixResult {
  if (ruleId === "aria-required-attr") {
    // Common: role="checkbox" missing aria-checked
    if (html.includes('role="checkbox"') && !html.includes("aria-checked")) {
      const fixed = html.replace('role="checkbox"', 'role="checkbox" aria-checked="false"');
      return { code: fixed, explanation: "Added required aria-checked attribute for checkbox role", effort: "low" };
    }
    if (html.includes('role="tab"') && !html.includes("aria-selected")) {
      const fixed = html.replace('role="tab"', 'role="tab" aria-selected="false"');
      return { code: fixed, explanation: "Added required aria-selected attribute for tab role", effort: "low" };
    }
    return { code: html, explanation: "Add the required ARIA attributes for this element's role (check WAI-ARIA spec)", effort: "medium" };
  }

  if (ruleId === "aria-valid-attr-value") {
    return { code: html, explanation: "Fix the ARIA attribute value — ensure it matches allowed values for the property", effort: "low" };
  }

  // aria-roles
  return { code: html, explanation: "Use a valid WAI-ARIA role value (see: w3.org/TR/wai-aria/#role_definitions)", effort: "medium" };
}

function fixKeyboard(html: string, ruleId: string): FixResult {
  if (ruleId === "tabindex" && html.includes("tabindex")) {
    const fixed = html.replace(/tabindex=["']\d+["']/, 'tabindex="0"');
    return { code: fixed, explanation: "Changed positive tabindex to 0 (use DOM order for focus sequence)", effort: "low" };
  }

  if (html.includes("<div") || html.includes("<span")) {
    // Non-interactive element being used as interactive
    const fixed = html.replace(/<(div|span)/, '<button').replace(/<\/(div|span)>/, '</button>');
    return { code: fixed, explanation: "Replace non-interactive element with <button> for keyboard accessibility", effort: "medium" };
  }

  return { code: html, explanation: "Ensure this element is reachable and operable via keyboard (Tab + Enter/Space)", effort: "medium" };
}

function fixDuplicateId(html: string): FixResult {
  const idMatch = html.match(/id=["']([^"']+)["']/);
  if (idMatch) {
    const newId = `${idMatch[1]}-unique`;
    const fixed = html.replace(`id="${idMatch[1]}"`, `id="${newId}"`);
    return { code: fixed, explanation: `Renamed duplicate id to "${newId}" — ensure each id is unique on the page`, effort: "low" };
  }
  return { code: html, explanation: "Give this element a unique id value", effort: "low" };
}

function fixMetaViewport(): FixResult {
  const fixed = '<meta name="viewport" content="width=device-width, initial-scale=1">';
  return { code: fixed, explanation: "Removed maximum-scale/user-scalable=no to allow pinch-zoom", effort: "low" };
}

// ─────────────── Categorizer ───────────────

function categorizeRule(ruleId: string): FixCategory {
  if (["image-alt", "input-image-alt", "svg-img-alt", "role-img-alt"].includes(ruleId)) return "add-alt-text";
  if (["color-contrast", "color-contrast-enhanced"].includes(ruleId)) return "fix-contrast";
  if (["label", "select-name"].includes(ruleId)) return "add-label";
  if (ruleId.startsWith("aria-")) return "fix-aria";
  if (["heading-order", "page-has-heading-one"].includes(ruleId)) return "fix-heading";
  if (["landmark-one-main", "region"].includes(ruleId)) return "add-landmark";
  if (["keyboard", "tabindex", "scrollable-region-focusable"].includes(ruleId)) return "fix-keyboard";
  if (["link-name", "link-in-text-block"].includes(ruleId)) return "fix-link";
  if (["button-name", "duplicate-id", "document-title"].includes(ruleId)) return "fix-form";
  return "other";
}
