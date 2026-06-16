import { describe, it, expect } from "vitest";
import { mapPrismaScanToResult, mapViolation } from "@/lib/scanner/scanResultMapper";

// Minimal Prisma-shaped fixtures (only the fields the mapper reads).
function prismaScan(over: Record<string, unknown> = {}) {
  return {
    id: "scan_1",
    url: "https://example.com/",
    status: "COMPLETED",
    score: 87,
    totalViolations: 3,
    critical: 1,
    serious: 1,
    moderate: 1,
    minor: 0,
    pageTitle: "Example",
    duration: 4200,
    screenshot: null,
    metadata: { browserEngine: "chromium", axeCoreVersion: "4.10" },
    startedAt: new Date("2026-06-16T10:00:00.000Z"),
    completedAt: new Date("2026-06-16T10:00:05.000Z"),
    createdAt: new Date("2026-06-16T09:59:00.000Z"),
    violations: [],
    ...over,
  } as never;
}

function prismaViolation(over: Record<string, unknown> = {}) {
  return {
    id: "v_db_1",
    ruleId: "color-contrast",
    impact: "serious",
    description: "Elements must have sufficient color contrast",
    help: "Ensure contrast",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
    tags: ["wcag2aa", "wcag143"],
    affectedElements: [{ html: "<a>x</a>", target: [".link"], failureSummary: "fix me" }],
    ...over,
  } as never;
}

describe("mapPrismaScanToResult", () => {
  it("produces the rich ScanResult shape the detail page expects", () => {
    const r = mapPrismaScanToResult(prismaScan({ violations: [prismaViolation()] }));
    // timestamp from completedAt, ISO string
    expect(r.timestamp).toBe("2026-06-16T10:00:05.000Z");
    expect(new Date(r.timestamp).toString()).not.toBe("Invalid Date");
    // status lower-cased
    expect(r.status).toBe("completed");
    // summary object (not flat columns)
    expect(r.summary).toEqual({ totalViolations: 3, critical: 1, serious: 1, moderate: 1, minor: 0, score: 87 });
    // metadata.scanDuration from duration, pageTitle from column
    expect(r.metadata.scanDuration).toBe(4200);
    expect(r.metadata.pageTitle).toBe("Example");
    expect(r.metadata.browserEngine).toBe("chromium");
  });

  it("maps violations: tags→wcagTags, affectedElements→nodes, ruleId→id", () => {
    const v = mapViolation(prismaViolation() as never);
    expect(v.id).toBe("color-contrast");
    expect(v.impact).toBe("serious");
    expect(v.wcagTags).toEqual(["wcag2aa", "wcag143"]);
    expect(v.nodes).toHaveLength(1);
    expect(v.nodes[0]).toEqual({ html: "<a>x</a>", target: [".link"], failureSummary: "fix me" });
    expect(v.helpUrl).toContain("color-contrast");
  });

  it("never yields undefined for the fields the UI reads (no crash inputs)", () => {
    // A sparse/edge row: nulls, missing metadata, weird affectedElements
    const r = mapPrismaScanToResult(prismaScan({
      score: null, pageTitle: null, duration: null, metadata: null, completedAt: null, startedAt: null,
      violations: [prismaViolation({ helpUrl: null, tags: null, affectedElements: "not-an-array" })],
    }));
    expect(r.summary.score).toBe(0);
    expect(r.metadata.scanDuration).toBe(0);
    expect(r.metadata.pageTitle).toBe("");
    expect(typeof r.timestamp).toBe("string");
    expect(new Date(r.timestamp).toString()).not.toBe("Invalid Date"); // falls back to createdAt
    const v = r.violations[0];
    expect(v.helpUrl).toBe("");
    expect(v.wcagTags).toEqual([]);
    expect(v.nodes).toEqual([]); // non-array affectedElements → []
  });

  it("falls back through completedAt → startedAt → createdAt for the timestamp", () => {
    const r = mapPrismaScanToResult(prismaScan({ completedAt: null }));
    expect(r.timestamp).toBe("2026-06-16T10:00:00.000Z"); // startedAt
  });
});
