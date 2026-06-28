/**
 * RegLayer — turn an axe lang-validity violation into a concrete fix.
 *
 * axe's html-lang-valid / valid-lang / html-xml-lang-mismatch fire when a
 * present `lang` (or `xml:lang`) attribute is malformed — and the bad value is
 * right in the persisted element snippet (e.g. `<html lang="en_US">`). We pull
 * it out and run the BCP-47 validator to offer the exact corrected tag
 * (en_US → en-US). Pure + deterministic; returns null unless there's a concrete,
 * DIFFERING correction (so we never render a no-op). Mirrors contrast-violation.
 */
import { validateLangTag } from "./lang-tag";

export interface LangTagViolationFix {
  value: string; // the invalid attribute value as authored
  suggestion: string; // the corrected BCP-47 tag
}

/** axe rule ids that fire on a present-but-invalid lang value. */
export const LANG_VALIDITY_RULES = new Set(["html-lang-valid", "valid-lang", "html-xml-lang-mismatch"]);

export function analyzeLangTagViolation(html: string): LangTagViolationFix | null {
  if (!html || typeof html !== "string") return null;

  // Prefer the plain `lang` attribute (not preceded by ":", so we skip xml:lang);
  // fall back to xml:lang when only that is present.
  const langValue = html.match(/(?:^|[\s"'])lang\s*=\s*["']([^"']*)["']/i)?.[1];
  const xmlValue = html.match(/xml:lang\s*=\s*["']([^"']*)["']/i)?.[1];
  const value = (langValue ?? xmlValue ?? "").trim();
  if (!value) return null;

  try {
    const r = validateLangTag(value);
    // Only surface a concrete fix that differs from what was authored.
    const fix = r.suggestion ?? (r.normalized && r.normalized !== value ? r.normalized : null);
    if (!fix || fix === value) return null;
    return { value, suggestion: fix };
  } catch {
    return null;
  }
}
