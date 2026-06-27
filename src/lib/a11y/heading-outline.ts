/**
 * RegLayer — heading-outline validator (WCAG 1.3.1 / 2.4.10)
 *
 * Validates a page's heading sequence: exactly one h1, no skipped levels
 * (h2 → h4), no empty headings, and the first heading at the top level. Returns
 * a flat indented outline alongside the issues. Pure + deterministic.
 */
export type HeadingSeverity = "error" | "warning";

export interface HeadingInput {
  level: number; // 1–6
  text: string;
}

export interface HeadingIssue {
  index: number; // -1 for document-level issues
  code: string;
  severity: HeadingSeverity;
  message: string;
}

export interface OutlineNode {
  level: number;
  text: string;
  /** Indentation depth in the logical outline (0-based). */
  depth: number;
}

export interface HeadingReport {
  ok: boolean;
  issues: HeadingIssue[];
  outline: OutlineNode[];
}

export function analyzeHeadings(headings: HeadingInput[]): HeadingReport {
  const issues: HeadingIssue[] = [];

  if (headings.length === 0) {
    issues.push({ index: -1, code: "no-headings", severity: "warning", message: "No headings found. Pages should use headings to convey structure." });
    return { ok: true, issues, outline: [] };
  }

  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count === 0) issues.push({ index: -1, code: "no-h1", severity: "error", message: "No <h1>. Every page needs exactly one top-level heading." });
  if (h1Count > 1) issues.push({ index: -1, code: "multiple-h1", severity: "warning", message: `Found ${h1Count} <h1> elements; a single <h1> best communicates the page topic.` });

  if (headings[0].level !== 1) {
    issues.push({ index: 0, code: "first-not-h1", severity: "warning", message: `The first heading is an <h${headings[0].level}>; the document should open with its <h1>.` });
  }

  let prev = 0;
  headings.forEach((h, index) => {
    if (h.level < 1 || h.level > 6) {
      issues.push({ index, code: "invalid-level", severity: "error", message: `Heading level ${h.level} is out of range (must be 1–6).` });
    }
    if (!h.text || h.text.trim() === "") {
      issues.push({ index, code: "empty", severity: "error", message: "Empty heading — screen-reader users navigating by heading will hit a blank stop." });
    }
    if (prev > 0 && h.level > prev + 1) {
      issues.push({ index, code: "skipped-level", severity: "error", message: `Heading level jumps from h${prev} to h${h.level}; don't skip levels (the next should be h${prev + 1}).` });
    }
    prev = h.level;
  });

  // Outline depth: derived from the sequence, not the raw level, so a clean
  // (even if shifted) hierarchy still renders as a sensible tree.
  const outline: OutlineNode[] = [];
  const stack: number[] = [];
  for (const h of headings) {
    while (stack.length && stack[stack.length - 1] >= h.level) stack.pop();
    outline.push({ level: h.level, text: h.text, depth: stack.length });
    stack.push(h.level);
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues, outline };
}
