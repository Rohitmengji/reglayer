/**
 * RegLayer — alt-text quality linter (WCAG 1.1.1)
 *
 * axe can tell you an <img> is MISSING alt; it can't tell you the alt is bad.
 * This grades alt text against the patterns real audits flag: redundant
 * "image of…" prefixes, filenames, placeholders, generic words, and over-long
 * descriptions. Pure + deterministic.
 */
export type AltSeverity = "error" | "warning" | "info";

export interface AltIssue {
  code: string;
  severity: AltSeverity;
  message: string;
}

export interface AltReport {
  /** 0–100 quality score (100 = no issues). */
  score: number;
  ok: boolean;
  issues: AltIssue[];
}

const REDUNDANT_PREFIX = /^\s*(image|photo|picture|graphic|drawing|illustration|icon|logo|screenshot)\s*(of|:|showing|that shows)?\b/i;
const FILENAME = /\.(jpe?g|png|gif|svg|webp|avif|bmp|tiff?)(\?|$)/i;
const PLACEHOLDER = /^\s*(image|img|photo|picture|graphic|untitled|placeholder|alt text|todo|dsc|img_?\d+|image\s*\d+)\s*$/i;
const MAX_LEN = 150;

/**
 * Grade an alt attribute. `alt === null` means the attribute is absent;
 * `alt === ""` is an explicit empty alt (correct ONLY for decorative images).
 */
export function analyzeAltText(alt: string | null, opts: { decorative?: boolean } = {}): AltReport {
  const issues: AltIssue[] = [];
  const decorative = opts.decorative ?? false;

  if (alt === null || alt === undefined) {
    if (!decorative) {
      issues.push({ code: "missing", severity: "error", message: "Image has no alt attribute. Add descriptive alt text, or alt=\"\" if it's purely decorative." });
    }
    return finalize(issues);
  }

  const trimmed = alt.trim();

  if (trimmed === "") {
    if (!decorative) {
      issues.push({ code: "empty", severity: "warning", message: "Empty alt is correct only for decorative images. If this image conveys meaning, describe it." });
    }
    return finalize(issues);
  }

  if (decorative) {
    issues.push({ code: "decorative-has-text", severity: "warning", message: "Marked decorative but has alt text — decorative images should use alt=\"\" so screen readers skip them." });
  }
  if (REDUNDANT_PREFIX.test(trimmed)) {
    issues.push({ code: "redundant-prefix", severity: "warning", message: "Don't start with \"image of\"/\"photo of\" — screen readers already announce it as an image." });
  }
  if (FILENAME.test(trimmed)) {
    issues.push({ code: "filename", severity: "error", message: "Alt text looks like a filename. Describe the image's meaning, not its file." });
  }
  if (PLACEHOLDER.test(trimmed)) {
    issues.push({ code: "placeholder", severity: "error", message: "Alt text is a generic placeholder — it conveys nothing to a screen-reader user." });
  }
  if (trimmed.length > MAX_LEN) {
    issues.push({ code: "too-long", severity: "info", message: `Alt text is ${trimmed.length} chars; aim for under ${MAX_LEN}. For long descriptions, use a caption or adjacent text.` });
  }
  if (/^[^a-z0-9]+$/i.test(trimmed)) {
    issues.push({ code: "no-words", severity: "warning", message: "Alt text has no words — it won't describe anything useful." });
  }

  return finalize(issues);
}

function finalize(issues: AltIssue[]): AltReport {
  const penalty = issues.reduce((sum, i) => sum + (i.severity === "error" ? 50 : i.severity === "warning" ? 25 : 10), 0);
  const score = Math.max(0, 100 - penalty);
  return { score, ok: !issues.some((i) => i.severity === "error"), issues };
}
