/**
 * RegLayer — page-level a11y insights from a lightweight scan capture.
 *
 * The scanner captures a small structure snapshot per page into
 * Scan.metadata.pageStructure: the heading list, the <html lang> value, and the
 * PRE-COMPUTED readability report (NOT the raw page text — see below). This
 * composes the pure engines — heading-outline (1.3.1/2.4.10), readability
 * (3.1.5), and BCP-47 lang validation (3.1.1) — into one report the scan UI
 * renders as a "Page structure & content" panel.
 *
 * SECURITY/PRIVACY: readability is computed at capture time and only its derived
 * numbers are stored — raw body text (which can contain PII on authenticated
 * pages, and would bloat crawl metadata + leak via account export) is NEVER
 * persisted.
 *
 * Pure + deterministic. Returns null when nothing meaningful was captured (older
 * scans degrade gracefully). Hardened against malformed/corrupted persisted data:
 * it validates element/field types before delegating, and never throws (a throw
 * here would wipe the whole client-rendered scan-detail page via its error
 * boundary).
 */
import { analyzeHeadings, type HeadingReport } from "./heading-outline";
import { type ReadabilityReport } from "./readability";
import { validateLangTag, type LangReport } from "./lang-tag";

/** Snapshot captured in-page during the axe run (stored in Scan.metadata.pageStructure). */
export interface PageStructureCapture {
  lang: string | null;
  headings: { level: number; text: string }[];
  /** Readability computed at capture time — derived numbers only, no raw text. */
  readability: ReadabilityReport | null;
}

export interface PageInsights {
  headings: HeadingReport | null;
  readability: ReadabilityReport | null;
  lang: { value: string | null; report: LangReport | null };
  /** Total surfaced issues across the three lenses — drives a summary badge. */
  issueCount: number;
}

export function computePageInsights(capture: PageStructureCapture | null | undefined): PageInsights | null {
  if (!capture || typeof capture !== "object") return null;

  try {
    // Sanitize persisted data (cast from DB JSON is unchecked) before delegating
    // to the engines — a malformed element must degrade to "no panel", not crash.
    const safeHeadings = Array.isArray(capture.headings)
      ? capture.headings
          .filter((h): h is { level: number; text: string } =>
            !!h && typeof h === "object" && typeof (h as { level?: unknown }).level === "number" && Number.isFinite((h as { level: number }).level))
          .map((h) => ({ level: h.level, text: typeof h.text === "string" ? h.text : "" }))
      : null;
    const headings = safeHeadings ? analyzeHeadings(safeHeadings) : null;

    const readability =
      capture.readability && typeof capture.readability === "object" && typeof capture.readability.words === "number"
        ? capture.readability
        : null;

    const langValue = typeof capture.lang === "string" ? capture.lang : null;
    const langReport = langValue ? validateLangTag(langValue) : null;

    if (!headings && !readability && !langReport) return null;

    const issueCount =
      (headings?.issues.length ?? 0) +
      (langReport && !langReport.valid ? 1 : 0) +
      (readability && !readability.meetsWcagAaa ? 1 : 0);

    return { headings, readability, lang: { value: langValue, report: langReport }, issueCount };
  } catch {
    return null;
  }
}
