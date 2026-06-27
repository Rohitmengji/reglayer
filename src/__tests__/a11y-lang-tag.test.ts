import { describe, it, expect } from "vitest";
import { validateLangTag } from "@/lib/a11y/lang-tag";

describe("validateLangTag", () => {
  it("accepts well-formed tags", () => {
    expect(validateLangTag("en").valid).toBe(true);
    const us = validateLangTag("en-US");
    expect(us.valid).toBe(true);
    expect(us.normalized).toBe("en-US");
    expect(us.parts?.region).toBe("US");
    const zh = validateLangTag("zh-Hans-CN");
    expect(zh.valid).toBe(true);
    expect(zh.normalized).toBe("zh-Hans-CN");
    expect(zh.parts?.script).toBe("Hans");
  });
  it("normalizes casing and suggests the canonical form", () => {
    const r = validateLangTag("EN");
    expect(r.normalized).toBe("en");
    expect(r.suggestion).toBe("en");
  });
  it("rejects underscores and suggests hyphenated form", () => {
    const r = validateLangTag("en_US");
    expect(r.valid).toBe(false);
    expect(r.suggestion).toBe("en-US");
  });
  it("maps a language NAME to its code", () => {
    const r = validateLangTag("english");
    expect(r.valid).toBe(false);
    expect(r.suggestion).toBe("en");
  });
  it("rejects malformed and unknown primary subtags", () => {
    expect(validateLangTag("123").valid).toBe(false);
    expect(validateLangTag("xyz").valid).toBe(false); // structurally ok, unknown code
    expect(validateLangTag("").valid).toBe(false);
  });
});
