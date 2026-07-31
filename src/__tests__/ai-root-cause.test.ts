/**
 * Tests for the AI Root Cause Engine — pure clustering by shared component root,
 * blast-radius counting, leverage ranking, and the "fix once" narrative.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import { buildRootCauseClusters, type RootCauseInput } from "@/lib/intelligence/rootCause";

const at = (n: number) => new Date(2026, 2, n);
const v = (ruleId: string, impact: string, url: string, selector: string, day: number): RootCauseInput => ({
  ruleId,
  impact,
  url,
  selector,
  at: at(day),
});

describe("AI Root Cause Engine", () => {
  it("collapses the same component across many pages into one root", () => {
    const inputs: RootCauseInput[] = [
      v("button-name", "serious", "https://s.com/a", ".icon-btn", 11),
      v("button-name", "serious", "https://s.com/b", ".icon-btn", 12),
      v("button-name", "serious", "https://s.com/c", ".icon-btn", 13),
    ];
    const [root] = buildRootCauseClusters(inputs);
    expect(root.ruleId).toBe("button-name");
    expect(root.instanceCount).toBe(3);
    expect(root.affectedPages).toBe(3);
    expect(root.fixOnceResolves).toBe(3);
    expect(root.component).toContain(".icon-btn");
  });

  it("records the earliest sighting as the origin", () => {
    const inputs = [
      v("button-name", "serious", "https://s.com/a", ".icon-btn", 20),
      v("button-name", "serious", "https://s.com/b", ".icon-btn", 11),
    ];
    const [root] = buildRootCauseClusters(inputs);
    expect(root.firstSeenAt.slice(0, 10)).toBe(at(11).toISOString().slice(0, 10));
  });

  it("ranks the highest-leverage root first (more pages × impact)", () => {
    const inputs = [
      // Widespread serious root — 3 pages
      v("button-name", "serious", "https://s.com/a", ".icon-btn", 11),
      v("button-name", "serious", "https://s.com/b", ".icon-btn", 11),
      v("button-name", "serious", "https://s.com/c", ".icon-btn", 11),
      // Narrow critical root — 1 page
      v("image-alt", "critical", "https://s.com/a", ".hero img", 11),
    ];
    const clusters = buildRootCauseClusters(inputs);
    expect(clusters[0].ruleId).toBe("button-name"); // 3×1.5=4.5 > 1×2.0=2.0
    expect(clusters[0].leverageScore).toBeGreaterThan(clusters[1].leverageScore);
  });

  it("keeps distinct components as separate roots", () => {
    const inputs = [
      v("button-name", "serious", "https://s.com/a", ".icon-btn", 11),
      v("button-name", "serious", "https://s.com/a", ".menu-btn", 11),
    ];
    const clusters = buildRootCauseClusters(inputs);
    expect(clusters).toHaveLength(2);
  });

  it("escalates to the worst impact seen in the cluster", () => {
    const inputs = [
      v("button-name", "minor", "https://s.com/a", ".icon-btn", 11),
      v("button-name", "critical", "https://s.com/b", ".icon-btn", 12),
    ];
    const [root] = buildRootCauseClusters(inputs);
    expect(root.impact).toBe("critical");
  });

  it("produces a fix-once narrative naming the component and page count", () => {
    const inputs = Array.from({ length: 5 }, (_, i) => v("button-name", "serious", `https://s.com/${i}`, ".icon-btn", 11));
    const [root] = buildRootCauseClusters(inputs);
    expect(root.narrative).toContain(".icon-btn");
    expect(root.narrative).toContain("5 pages");
    expect(root.narrative).toMatch(/Fix it once/i);
  });

  it("classifies the root cause from the rule", () => {
    const [root] = buildRootCauseClusters([v("image-alt", "critical", "https://s.com/a", ".hero img", 11)]);
    expect(root.rootCause).toContain("content-value drift");
  });

  it("returns empty for no violations", () => {
    expect(buildRootCauseClusters([])).toHaveLength(0);
  });
});
