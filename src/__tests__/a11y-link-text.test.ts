import { describe, it, expect } from "vitest";
import { classifyLinkText, analyzeLinks } from "@/lib/a11y/link-text";

describe("classifyLinkText", () => {
  it("flags ambiguous phrases", () => {
    expect(classifyLinkText("click here")?.code).toBe("ambiguous");
    expect(classifyLinkText("Read more")?.code).toBe("ambiguous");
    expect(classifyLinkText("here.")?.code).toBe("ambiguous"); // trailing punctuation ignored
  });
  it("flags empty link text as an error", () => {
    expect(classifyLinkText("")?.severity).toBe("error");
  });
  it("flags a raw URL used as link text", () => {
    expect(classifyLinkText("https://example.com/page")?.code).toBe("raw-url");
  });
  it("passes descriptive link text", () => {
    expect(classifyLinkText("Download the 2024 annual report (PDF)")).toBeNull();
  });
});

describe("analyzeLinks", () => {
  it("flags identical text pointing at different destinations", () => {
    const r = analyzeLinks([
      { text: "Read more", href: "/a" },
      { text: "Read more", href: "/b" },
    ]);
    expect(r.issues.some((i) => i.code === "same-text-different-href")).toBe(true);
  });
  it("does not flag identical text to the same destination", () => {
    const r = analyzeLinks([
      { text: "Pricing", href: "/pricing" },
      { text: "Pricing", href: "/pricing" },
    ]);
    expect(r.issues.some((i) => i.code === "same-text-different-href")).toBe(false);
  });
  it("ok is false only when an empty link is present", () => {
    expect(analyzeLinks([{ text: "click here", href: "/x" }]).ok).toBe(true);
    expect(analyzeLinks([{ text: "", href: "/x" }]).ok).toBe(false);
  });
});
