/**
 * RegLayer — link-text linter (WCAG 2.4.4 / 2.4.9)
 *
 * Flags non-descriptive link text ("click here", "read more"), empty links,
 * raw-URL link text, and the subtle one most tools miss: the SAME visible text
 * pointing at DIFFERENT destinations (ambiguous to screen-reader users who pull
 * up a list of links). Pure + deterministic.
 */
export type LinkSeverity = "error" | "warning";

export interface LinkInput {
  text: string;
  href?: string;
}

export interface LinkIssue {
  index: number;
  text: string;
  code: string;
  severity: LinkSeverity;
  message: string;
}

export interface LinkReport {
  ok: boolean;
  issues: LinkIssue[];
}

/** Phrases that say nothing about the destination. */
const AMBIGUOUS = new Set([
  "click here", "click", "here", "read more", "more", "learn more", "details",
  "this", "this link", "link", "go", "continue", "see more", "view", "info", "more info", "read",
]);

const URL_LIKE = /^(https?:\/\/|www\.)/i;

/** Classify a single link's visible text (no cross-link context). */
export function classifyLinkText(text: string): { code: string; severity: LinkSeverity; message: string } | null {
  const t = text.trim().toLowerCase().replace(/[\s ]+/g, " ").replace(/[.!?:]+$/, "");
  if (t === "") return { code: "empty", severity: "error", message: "Link has no discernible text." };
  if (AMBIGUOUS.has(t)) return { code: "ambiguous", severity: "warning", message: `"${text.trim()}" doesn't describe its destination — out of context (e.g. a screen-reader link list) it's meaningless.` };
  if (URL_LIKE.test(text.trim())) return { code: "raw-url", severity: "warning", message: "Raw URL as link text is hard to read aloud — use a human-readable label." };
  return null;
}

export function analyzeLinks(links: LinkInput[]): LinkReport {
  const issues: LinkIssue[] = [];

  links.forEach((link, index) => {
    const single = classifyLinkText(link.text ?? "");
    if (single) issues.push({ index, text: link.text ?? "", ...single });
  });

  // Same visible text → different destinations (WCAG 2.4.4 ambiguity).
  const byText = new Map<string, Set<string>>();
  links.forEach((link) => {
    const key = (link.text ?? "").trim().toLowerCase();
    if (!key || link.href === undefined) return;
    if (!byText.has(key)) byText.set(key, new Set());
    byText.get(key)!.add(link.href);
  });
  links.forEach((link, index) => {
    const key = (link.text ?? "").trim().toLowerCase();
    if (key && byText.get(key) && byText.get(key)!.size > 1) {
      issues.push({ index, text: link.text ?? "", code: "same-text-different-href", severity: "warning", message: `"${link.text?.trim()}" is used for multiple different destinations — make each link's text uniquely describe its target.` });
    }
  });

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}
