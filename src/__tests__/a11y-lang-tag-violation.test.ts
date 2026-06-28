import { describe, it, expect } from "vitest";
import { analyzeLangTagViolation, LANG_VALIDITY_RULES } from "@/lib/a11y/lang-tag-violation";

describe("analyzeLangTagViolation", () => {
  it("extracts an invalid lang from an axe snippet and suggests the fix", () => {
    const fix = analyzeLangTagViolation('<html lang="en_US"><head></head><body></body></html>');
    expect(fix).toEqual({ value: "en_US", suggestion: "en-US" });
  });
  it("maps a language name to its code", () => {
    expect(analyzeLangTagViolation('<html lang="english">')).toEqual({ value: "english", suggestion: "en" });
  });
  it("falls back to xml:lang when there's no plain lang", () => {
    const fix = analyzeLangTagViolation('<html xml:lang="fr_CA">');
    expect(fix).toEqual({ value: "fr_CA", suggestion: "fr-CA" });
  });
  it("returns null when there's no concrete differing correction (valid / unknown)", () => {
    expect(analyzeLangTagViolation('<html lang="en-US">')).toBeNull(); // already valid
    expect(analyzeLangTagViolation('<html lang="xyz">')).toBeNull(); // unknown code — don't fabricate
    expect(analyzeLangTagViolation('<div>no lang here</div>')).toBeNull();
    expect(analyzeLangTagViolation("")).toBeNull();
  });
  it("exposes the three axe lang-validity rule ids", () => {
    expect(LANG_VALIDITY_RULES.has("html-lang-valid")).toBe(true);
    expect(LANG_VALIDITY_RULES.has("valid-lang")).toBe(true);
    expect(LANG_VALIDITY_RULES.has("html-xml-lang-mismatch")).toBe(true);
    expect(LANG_VALIDITY_RULES.has("html-has-lang")).toBe(false); // missing-lang ≠ invalid-lang
  });
});
