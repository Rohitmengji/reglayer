import { describe, it, expect } from "vitest";
import { analyzeFocusOrder } from "@/lib/a11y/focus-order";

describe("analyzeFocusOrder", () => {
  it("accepts a clean DOM-order sequence (no positive tabindex)", () => {
    const r = analyzeFocusOrder([
      { label: "Home", interactive: true },
      { label: "Email", tabindex: 0 },
      { label: "Submit", interactive: true },
    ]);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.code === "positive-tabindex")).toBe(false);
    expect(r.tabSequence.map((t) => t.index)).toEqual([0, 1, 2]);
  });
  it("warns on positive tabindex and reorders the sequence ahead of natural order", () => {
    const r = analyzeFocusOrder([
      { label: "A", interactive: true },
      { label: "B", tabindex: 5 },
      { label: "C", tabindex: 1 },
    ]);
    expect(r.issues.some((i) => i.code === "positive-tabindex")).toBe(true);
    expect(r.issues.some((i) => i.code === "order-mismatch")).toBe(true);
    // tabindex 1 (C) then 5 (B) then natural A
    expect(r.tabSequence.map((t) => t.index)).toEqual([2, 1, 0]);
  });
  it("errors on a hidden but focusable element", () => {
    const r = analyzeFocusOrder([{ label: "Hidden menu item", tabindex: 0, visible: false }]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "focusable-hidden")).toBe(true);
    // Hidden element is excluded from the effective tab sequence.
    expect(r.tabSequence).toHaveLength(0);
  });
});
