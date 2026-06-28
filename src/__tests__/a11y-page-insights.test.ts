import { describe, it, expect } from "vitest";
import { computePageInsights } from "@/lib/a11y/page-insights";
import { analyzeReadability } from "@/lib/a11y/readability";

describe("computePageInsights", () => {
  it("returns null for no capture (older scans degrade gracefully)", () => {
    expect(computePageInsights(null)).toBeNull();
    expect(computePageInsights(undefined)).toBeNull();
  });

  it("composes heading, readability, and lang lenses from a capture", () => {
    const insights = computePageInsights({
      lang: "en",
      headings: [
        { level: 1, text: "Title" },
        { level: 2, text: "Section" },
      ],
      readability: analyzeReadability("The cat sat on the mat. The dog ran fast."),
    });
    expect(insights).not.toBeNull();
    expect(insights!.headings?.ok).toBe(true);
    expect(insights!.readability?.fleschReadingEase).toBeGreaterThan(80);
    expect(insights!.lang.report?.valid).toBe(true);
    expect(insights!.issueCount).toBe(0);
  });

  it("counts issues across lenses (skipped heading + invalid lang)", () => {
    const insights = computePageInsights({
      lang: "en_US", // invalid (underscore)
      headings: [
        { level: 1, text: "Title" },
        { level: 3, text: "Skipped to h3" }, // skipped-level error
      ],
      readability: null,
    });
    expect(insights!.lang.report?.valid).toBe(false);
    expect(insights!.headings?.ok).toBe(false);
    expect(insights!.issueCount).toBeGreaterThan(0);
  });

  it("handles a partial capture (lang only)", () => {
    const insights = computePageInsights({ lang: "fr", headings: [], readability: null });
    expect(insights).not.toBeNull();
    expect(insights!.lang.report?.valid).toBe(true);
    expect(insights!.readability).toBeNull();
  });

  // ── Hardening against corrupted/legacy persisted data (must never throw —
  //    a throw would wipe the whole client-rendered scan-detail page) ──
  it("does not throw on malformed heading elements (null / wrong-typed)", () => {
    const insights = computePageInsights({
      lang: "en",
      // @ts-expect-error — simulating corrupted DB JSON
      headings: [null, { level: "two", text: 5 }, { level: 2, text: "ok" }],
      readability: null,
    });
    // It sanitizes to the one valid heading and still returns a report.
    expect(insights).not.toBeNull();
    expect(insights!.headings).not.toBeNull();
  });

  it("does not throw on a non-string lang (corrupted JSON)", () => {
    const insights = computePageInsights({
      // @ts-expect-error — simulating corrupted DB JSON
      lang: 123,
      headings: [{ level: 1, text: "T" }],
      readability: null,
    });
    expect(insights!.lang.value).toBeNull(); // non-string lang ignored, no crash
  });
});
