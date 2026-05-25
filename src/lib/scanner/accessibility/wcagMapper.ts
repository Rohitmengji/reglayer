/**
 * ---------------------------------------------------------
 * RegLayer — WCAG Mapper
 * ---------------------------------------------------------
 *
 * Purpose:
 * Maps axe-core rule tags to WCAG success criteria
 * and compliance regulations.
 *
 * Why this exists:
 * axe-core returns tags like "wcag2a", "wcag311".
 * Compliance reporting requires human-readable WCAG
 * criteria references (e.g., "WCAG 2.1 Level A - 3.1.1").
 *
 * Engineering Notes:
 * - This is a pure mapping/transformation module.
 * - No side effects, no external dependencies.
 * - Easily extensible for new regulations.
 * ---------------------------------------------------------
 */

export interface WcagMapping {
  criterion: string;
  level: "A" | "AA" | "AAA";
  title: string;
  principle: string;
}

const WCAG_CRITERIA_MAP: Record<string, WcagMapping> = {
  wcag111: {
    criterion: "1.1.1",
    level: "A",
    title: "Non-text Content",
    principle: "Perceivable",
  },
  wcag121: {
    criterion: "1.2.1",
    level: "A",
    title: "Audio-only and Video-only",
    principle: "Perceivable",
  },
  wcag131: {
    criterion: "1.3.1",
    level: "A",
    title: "Info and Relationships",
    principle: "Perceivable",
  },
  wcag141: {
    criterion: "1.4.1",
    level: "A",
    title: "Use of Color",
    principle: "Perceivable",
  },
  wcag143: {
    criterion: "1.4.3",
    level: "AA",
    title: "Contrast (Minimum)",
    principle: "Perceivable",
  },
  wcag211: {
    criterion: "2.1.1",
    level: "A",
    title: "Keyboard",
    principle: "Operable",
  },
  wcag241: {
    criterion: "2.4.1",
    level: "A",
    title: "Bypass Blocks",
    principle: "Operable",
  },
  wcag242: {
    criterion: "2.4.2",
    level: "A",
    title: "Page Titled",
    principle: "Operable",
  },
  wcag244: {
    criterion: "2.4.4",
    level: "A",
    title: "Link Purpose (In Context)",
    principle: "Operable",
  },
  wcag311: {
    criterion: "3.1.1",
    level: "A",
    title: "Language of Page",
    principle: "Understandable",
  },
  wcag312: {
    criterion: "3.1.2",
    level: "AA",
    title: "Language of Parts",
    principle: "Understandable",
  },
  wcag411: {
    criterion: "4.1.1",
    level: "A",
    title: "Parsing",
    principle: "Robust",
  },
  wcag412: {
    criterion: "4.1.2",
    level: "A",
    title: "Name, Role, Value",
    principle: "Robust",
  },
};

/**
 * Extract WCAG criteria from axe-core tags.
 */
export function mapTagsToWcag(tags: string[]): WcagMapping[] {
  const mappings: WcagMapping[] = [];

  for (const tag of tags) {
    const normalized = tag.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (WCAG_CRITERIA_MAP[normalized]) {
      mappings.push(WCAG_CRITERIA_MAP[normalized]);
    }
  }

  return mappings;
}

/**
 * Get the highest WCAG level from tags.
 */
export function getWcagLevel(tags: string[]): "A" | "AA" | "AAA" | "unknown" {
  if (tags.some((t) => t.includes("wcag2aaa"))) return "AAA";
  if (tags.some((t) => t.includes("wcag2aa") || t.includes("wcag21aa")))
    return "AA";
  if (tags.some((t) => t.includes("wcag2a") || t.includes("wcag21a")))
    return "A";
  return "unknown";
}
