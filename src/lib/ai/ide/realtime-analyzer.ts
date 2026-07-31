/**
 * RegLayer — Accessibility Copilot: real-time inline source analyzer
 *
 * The experience: as a developer types, accessibility problems surface INLINE,
 * before commit — the moment they cost minutes to fix instead of a remediation
 * cycle.
 *
 *   <img src="hero.png">          → "Missing alt text." (WCAG 1.1.1)
 *   <div onClick={select}>        → "Keyboard inaccessible." (WCAG 2.1.1)
 *   <Modal>                       → "Missing focus trap / Escape." (WCAG 2.4.3)
 *
 * DESIGN:
 *   - PURE and dependency-free — safe to import into a VS Code extension, a
 *     language server, a pre-commit hook, or the API. No `server-only`, no DOM,
 *     no LLM: it must run on every keystroke.
 *   - FRAGMENT-TOLERANT — real editor buffers are half-written. Detection is
 *     regex/tag-scan based, not a full parser, so an incomplete `<div onClick`
 *     still lints.
 *   - Two layers, unified into one diagnostic stream:
 *       1. ELEMENT rules  — per-tag anti-patterns (img/alt, onClick on a div…).
 *       2. PATTERN forecast — component-level contracts (dialog/tabs/menu) via
 *          the existing pattern-prediction engine (no duplication).
 */

import { forecast, type UiPattern } from "./pattern-prediction";

export type Severity = "error" | "warning" | "info";

export interface A11yDiagnostic {
  ruleId: string;
  severity: Severity;
  message: string;
  wcag: string[];
  /** 1-based line. */
  line: number;
  /** 1-based column of the start of the offending token. */
  column: number;
  /** 1-based column just past the token. */
  endColumn: number;
  /** Actionable one-liner. */
  suggestion?: string;
  /** True for behavioural requirements no scanner can verify (focus trap, Escape…). */
  invisibleToScanners?: boolean;
}

export interface AnalyzeResult {
  diagnostics: A11yDiagnostic[];
  pattern: UiPattern | null;
  counts: { error: number; warning: number; info: number };
  summary: string;
}

// ── Tag extraction (fragment-tolerant) ──────────────────────────────────────

interface ParsedTag {
  tag: string;
  attrs: string;
  line: number; // 1-based
  column: number; // 1-based (position of "<")
  /** Column just past the tag name, where attrs begin. */
  nameEndColumn: number;
}

// Opening tags, including still-unclosed ones at end of line: `<div onClick`.
const TAG_RE = /<([A-Za-z][A-Za-z0-9-]*)((?:[^<>]*?))(?:\/?>|(?=\n)|$)/g;

/** Convert a string offset to 1-based line/column. */
function offsetToLineCol(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

function extractTags(source: string): ParsedTag[] {
  const tags: ParsedTag[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(source)) !== null) {
    const [, tag, attrs] = m;
    const { line, column } = offsetToLineCol(source, m.index);
    tags.push({ tag, attrs: attrs ?? "", line, column, nameEndColumn: column + 1 + tag.length });
    if (m.index === TAG_RE.lastIndex) TAG_RE.lastIndex++; // guard against zero-width matches
  }
  return tags;
}

// ── Element-level rules ─────────────────────────────────────────────────────

/** Elements that are natively focusable / interactive. */
const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary", "option", "details"]);

const hasAttr = (attrs: string, name: string): boolean =>
  new RegExp(`\\b${name}\\s*=`, "i").test(attrs);
const hasClickHandler = (attrs: string): boolean => /\bon[Cc]lick\s*=/.test(attrs);
const hasKeyHandler = (attrs: string): boolean => /\bon[Kk]ey(?:Down|Press|Up|down|press|up)\s*=/.test(attrs);
const isAriaHidden = (attrs: string): boolean => /\baria-hidden\s*=\s*["'{]?\s*true/i.test(attrs);

interface ElementRule {
  ruleId: string;
  severity: Severity;
  wcag: string[];
  suggestion: string;
  /** Return a message when the tag violates the rule, else null. */
  check: (t: ParsedTag) => string | null;
}

const ELEMENT_RULES: ElementRule[] = [
  {
    ruleId: "img-missing-alt",
    severity: "error",
    wcag: ["1.1.1"],
    suggestion: 'Add alt="" for decorative images, or a concise description for meaningful ones.',
    check: (t) => {
      const tag = t.tag.toLowerCase();
      if (tag !== "img" && tag !== "area" && tag !== "input") return null;
      if (tag === "input" && !/\btype\s*=\s*["']?image/i.test(t.attrs)) return null;
      if (hasAttr(t.attrs, "alt") || isAriaHidden(t.attrs) || hasAttr(t.attrs, "aria-label") || hasAttr(t.attrs, "aria-labelledby")) return null;
      return "Missing alt text — screen readers cannot describe this image.";
    },
  },
  {
    ruleId: "no-static-element-interactions",
    severity: "warning",
    wcag: ["2.1.1", "4.1.2"],
    suggestion: "Use a <button>, or add role, tabIndex={0} and a matching onKeyDown handler.",
    check: (t) => {
      const tag = t.tag.toLowerCase();
      if (INTERACTIVE_TAGS.has(tag) || t.tag[0] !== tag[0]) return null; // skip real & custom (PascalCase) components
      if (!hasClickHandler(t.attrs)) return null;
      if (hasAttr(t.attrs, "role") && hasKeyHandler(t.attrs)) return null;
      if (!hasKeyHandler(t.attrs)) return "Keyboard inaccessible — onClick on a non-interactive element with no keyboard handler.";
      if (!hasAttr(t.attrs, "role")) return "Non-interactive element with a click handler needs a role (e.g. role=\"button\").";
      return null;
    },
  },
  {
    ruleId: "anchor-missing-href",
    severity: "warning",
    wcag: ["2.1.1"],
    suggestion: "Give the <a> an href, or use a <button> for actions.",
    check: (t) => {
      if (t.tag.toLowerCase() !== "a") return null;
      if (hasAttr(t.attrs, "href")) return null;
      if (!hasClickHandler(t.attrs)) return null;
      return "Anchor without href isn't keyboard-focusable — use a <button> for click actions.";
    },
  },
  {
    ruleId: "no-positive-tabindex",
    severity: "warning",
    wcag: ["2.4.3"],
    suggestion: "Use tabIndex={0} or restructure the DOM; positive values break natural order.",
    check: (t) => (/\btab[Ii]ndex\s*=\s*["'{]?\s*([1-9]\d*)/.test(t.attrs) ? "Positive tabIndex disrupts the natural tab order." : null),
  },
  {
    ruleId: "no-autofocus",
    severity: "info",
    wcag: ["2.4.3"],
    suggestion: "Move focus deliberately in an effect instead of autoFocus, or confirm it's intentional.",
    check: (t) => (/\bauto[Ff]ocus\b/.test(t.attrs) ? "autoFocus can disorient screen-reader and keyboard users." : null),
  },
  {
    ruleId: "select-missing-name",
    severity: "warning",
    wcag: ["4.1.2", "3.3.2"],
    suggestion: "Associate a <label>, or add aria-label / aria-labelledby.",
    check: (t) => {
      const tag = t.tag.toLowerCase();
      if (tag !== "select" && tag !== "textarea") return null;
      if (hasAttr(t.attrs, "aria-label") || hasAttr(t.attrs, "aria-labelledby") || hasAttr(t.attrs, "id")) return null;
      return `<${tag}> has no accessible name — associate a label.`;
    },
  },
];

function analyzeElements(source: string): A11yDiagnostic[] {
  const diagnostics: A11yDiagnostic[] = [];
  for (const t of extractTags(source)) {
    for (const rule of ELEMENT_RULES) {
      const message = rule.check(t);
      if (message) {
        diagnostics.push({
          ruleId: rule.ruleId,
          severity: rule.severity,
          message,
          wcag: rule.wcag,
          line: t.line,
          column: t.column,
          endColumn: t.nameEndColumn,
          suggestion: rule.suggestion,
        });
      }
    }
  }
  return diagnostics;
}

// ── Pattern-level (component contracts) ─────────────────────────────────────

/** Earliest line whose text hints at the detected pattern, for diagnostic placement. */
function patternLine(source: string): number {
  const lines = source.split("\n");
  const hint = /\b(?:Modal|Dialog|Drawer|Lightbox|Tabs|Dropdown|ContextMenu|Accordion|Collapsible)\b|role=["'](?:alert)?dialog|aria-modal|\b(?:backdrop|overlay|scrim)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (hint.test(lines[i])) return i + 1;
  }
  return 1;
}

function analyzePatterns(source: string): { diagnostics: A11yDiagnostic[]; pattern: UiPattern | null } {
  const f = forecast(source);
  if (!f) return { diagnostics: [], pattern: null };

  const line = patternLine(source);
  const diagnostics: A11yDiagnostic[] = f.missing.map((req) => ({
    ruleId: `pattern/${req.id}`,
    severity: req.staticallyUndetectable ? "warning" : "info",
    message: `${f.pattern}: ${req.description}.`,
    wcag: req.wcag,
    line,
    column: 1,
    endColumn: 1,
    suggestion: req.rationale,
    invisibleToScanners: req.staticallyUndetectable,
  }));
  return { diagnostics, pattern: f.pattern };
}

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Analyze a source buffer for accessibility problems in real time. Combines
 * per-element anti-patterns with component-level pattern contracts. Pure and
 * fast — designed to run on every keystroke.
 */
export function analyzeSource(source: string): AnalyzeResult {
  if (!source || !source.trim()) {
    return { diagnostics: [], pattern: null, counts: { error: 0, warning: 0, info: 0 }, summary: "No accessibility issues." };
  }

  const elementDiagnostics = analyzeElements(source);
  const { diagnostics: patternDiagnostics, pattern } = analyzePatterns(source);

  const diagnostics = [...elementDiagnostics, ...patternDiagnostics].sort(
    (a, b) => a.line - b.line || a.column - b.column,
  );

  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of diagnostics) counts[d.severity]++;

  const total = diagnostics.length;
  const summary =
    total === 0
      ? "No accessibility issues detected."
      : `${total} accessibility issue${total === 1 ? "" : "s"}: ` +
        `${counts.error} error${counts.error === 1 ? "" : "s"}, ${counts.warning} warning${counts.warning === 1 ? "" : "s"}` +
        (counts.info ? `, ${counts.info} info` : "") +
        (pattern ? ` (building a ${pattern}).` : ".");

  return { diagnostics, pattern, counts, summary };
}
