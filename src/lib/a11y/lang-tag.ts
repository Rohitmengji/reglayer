/**
 * RegLayer — BCP-47 language-tag validator (WCAG 3.1.1 / 3.1.2)
 *
 * A wrong or malformed `lang` attribute makes screen readers use the wrong
 * pronunciation engine. This checks structural well-formedness (primary subtag,
 * optional script, region, variant), normalizes casing per BCP-47 conventions,
 * sanity-checks the primary subtag against a curated common set, and suggests a
 * correction for the usual mistakes (`en_US`, `EN`, `english`). Pure.
 */
export interface LangReport {
  input: string;
  valid: boolean;
  normalized: string | null;
  parts: { primary?: string; script?: string; region?: string; variants?: string[] } | null;
  issues: string[];
  suggestion: string | null;
}

// Common ISO-639 primary subtags (not exhaustive — used only to flag likely typos).
const COMMON_PRIMARY = new Set([
  "en", "es", "fr", "de", "it", "pt", "nl", "sv", "no", "nb", "nn", "da", "fi", "pl", "cs", "sk",
  "ru", "uk", "ro", "hu", "el", "tr", "ar", "he", "fa", "hi", "bn", "ur", "th", "vi", "id", "ms",
  "ja", "ko", "zh", "ga", "cy", "ca", "eu", "gl", "is", "et", "lv", "lt", "sl", "hr", "sr", "bg",
]);
const FULL_NAME_HINTS: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt",
  dutch: "nl", chinese: "zh", japanese: "ja", korean: "ko", arabic: "ar", russian: "ru", hindi: "hi",
};

const PRIMARY_RE = /^[a-z]{2,3}$/;
const SCRIPT_RE = /^[a-z]{4}$/;
const REGION_RE = /^([a-z]{2}|\d{3})$/;
const VARIANT_RE = /^([a-z0-9]{5,8}|\d[a-z0-9]{3})$/;

export function validateLangTag(input: string): LangReport {
  const issues: string[] = [];
  const raw = (input ?? "").trim();
  const report = (over: Partial<LangReport>): LangReport => ({
    input: raw, valid: false, normalized: null, parts: null, issues, suggestion: null, ...over,
  });

  if (raw === "") {
    issues.push("Empty lang value.");
    return report({});
  }

  // Common mistakes → propose the right tag.
  if (FULL_NAME_HINTS[raw.toLowerCase()]) {
    issues.push("Use the BCP-47 code, not the language name.");
    return report({ suggestion: FULL_NAME_HINTS[raw.toLowerCase()] });
  }
  let suggestion: string | null = null;
  let work = raw;
  if (work.includes("_")) {
    issues.push("BCP-47 uses hyphens, not underscores.");
    work = work.replace(/_/g, "-");
    suggestion = normalizeTag(work) ?? work;
  }

  const subtags = work.split("-");
  const parts: NonNullable<LangReport["parts"]> = { variants: [] };

  const primary = subtags.shift() ?? "";
  if (!PRIMARY_RE.test(primary.toLowerCase())) {
    issues.push(`"${primary}" is not a valid primary language subtag (2–3 letters).`);
    return report({ suggestion });
  }
  parts.primary = primary.toLowerCase();
  if (!COMMON_PRIMARY.has(parts.primary)) {
    issues.push(`"${parts.primary}" isn't a recognized common language code — double-check it.`);
  }

  // script (4 alpha) → region (2 alpha / 3 digit) → variants
  if (subtags.length && SCRIPT_RE.test(subtags[0].toLowerCase())) {
    const s = subtags.shift()!.toLowerCase();
    parts.script = s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (subtags.length && REGION_RE.test(subtags[0].toLowerCase())) {
    parts.region = subtags.shift()!.toUpperCase();
  }
  for (const v of subtags) {
    if (VARIANT_RE.test(v.toLowerCase())) parts.variants!.push(v.toLowerCase());
    else issues.push(`"${v}" is not a valid subtag.`);
  }

  const wellFormed = !issues.some((i) => i.includes("not a valid") || i.includes("not a valid subtag"));
  const normalized = wellFormed ? normalizeTag(work) : null;
  const valid = wellFormed && issues.length === 0;

  return report({ valid, normalized, parts, suggestion: suggestion ?? (normalized && normalized !== raw ? normalized : null) });
}

/** Re-emit a tag with canonical casing (lang lower, Script Title, REGION upper). */
function normalizeTag(tag: string): string | null {
  const subtags = tag.split("-");
  const out: string[] = [];
  const primary = subtags.shift();
  if (!primary || !PRIMARY_RE.test(primary.toLowerCase())) return null;
  out.push(primary.toLowerCase());
  let i = 0;
  if (subtags[i] && SCRIPT_RE.test(subtags[i].toLowerCase())) {
    out.push(subtags[i].charAt(0).toUpperCase() + subtags[i].slice(1).toLowerCase());
    i++;
  }
  if (subtags[i] && REGION_RE.test(subtags[i].toLowerCase())) {
    out.push(subtags[i].toUpperCase());
    i++;
  }
  for (; i < subtags.length; i++) out.push(subtags[i].toLowerCase());
  return out.join("-");
}
