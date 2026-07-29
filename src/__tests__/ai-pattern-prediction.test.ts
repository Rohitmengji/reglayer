/**
 * Interaction pattern prediction.
 *
 * The value here is anticipating requirements rather than reporting violations, so the
 * tests focus on two things: recognising a pattern from STRUCTURE rather than naming,
 * and correctly identifying the behavioural requirements that no scanner can observe —
 * because those are the ones that reach production.
 */

import { describe, it, expect } from "vitest";
import {
  detectPattern,
  forecast,
  predictRequirements,
} from "@/lib/ai/ide/pattern-prediction";

/** Modelled on components/ai/ChatPanel.tsx as it shipped before this session. */
const CHAT_PANEL_BEFORE = `
  <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={onClose} aria-hidden />
  <div className="fixed inset-y-0 right-0 z-50" role="complementary" aria-label="AI Chat Assistant">
    <button onClick={onClose} aria-label="Close chat panel">x</button>
  </div>
`;

const DIALOG_DONE = `
  <div role="dialog" aria-modal="true" aria-labelledby="title">
    <h2 id="title">Confirm</h2>
    <button ref={closeRef}>Close</button>
  </div>
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); restoreFocusRef.current?.focus(); };
  }, []);
  <FocusLock>{children}</FocusLock>
`;

describe("recognising a pattern from structure, not naming", () => {
  it("identifies a dialog even when it declares itself a landmark", () => {
    // This is the real ChatPanel case: role="complementary" with a modal backdrop.
    // A scanner sees a landmark behaving correctly and reports nothing.
    expect(detectPattern(CHAT_PANEL_BEFORE)).toBe("dialog");
  });

  it("identifies a dialog from an explicit role", () => {
    expect(detectPattern('<div role="dialog">')).toBe("dialog");
  });

  it("identifies a dialog from component naming", () => {
    expect(detectPattern("export function ConfirmModal() {")).toBe("dialog");
  });

  it("identifies tabs, menus, and disclosures", () => {
    expect(detectPattern('<div role="tablist">')).toBe("tabs");
    expect(detectPattern('<li role="menuitem">')).toBe("menu");
    expect(detectPattern("<button aria-expanded={open}>")).toBe("disclosure");
  });

  it("stays silent on ordinary markup", () => {
    // Predicting a pattern that is not there is worse than predicting nothing.
    expect(detectPattern("<section><p>Hello</p></section>")).toBeNull();
  });
});

describe("predicting requirements before they are violated", () => {
  it("lists the full dialog contract", () => {
    const requirements = predictRequirements("dialog", "");
    const ids = requirements.map((r) => r.id);

    expect(ids).toEqual([
      "dialog-role",
      "dialog-name",
      "dialog-focus-in",
      "dialog-focus-trap",
      "dialog-escape",
      "dialog-focus-restore",
    ]);
  });

  it("recognises requirements that are already handled", () => {
    const requirements = predictRequirements("dialog", DIALOG_DONE);
    expect(requirements.every((r) => r.satisfied)).toBe(true);
  });

  it("returns satisfied items too, not only gaps", () => {
    // A developer mid-build benefits from seeing the whole contract.
    const requirements = predictRequirements("dialog", DIALOG_DONE);
    expect(requirements).toHaveLength(6);
  });

  it("attaches WCAG criteria to each requirement", () => {
    for (const requirement of predictRequirements("dialog", "")) {
      expect(requirement.wcag.length).toBeGreaterThan(0);
    }
  });

  it("explains why each requirement exists", () => {
    for (const requirement of predictRequirements("dialog", "")) {
      expect(requirement.rationale.length).toBeGreaterThan(40);
    }
  });
});

describe("the requirements scanners cannot see", () => {
  it("flags behavioural requirements as undetectable by static analysis", () => {
    const result = forecast(CHAT_PANEL_BEFORE)!;
    const invisible = result.invisibleToScanners.map((r) => r.id);

    // A scanner sees a static DOM; it cannot observe that Escape does nothing or that
    // focus never returns to the trigger. These are what reach production.
    expect(invisible).toContain("dialog-escape");
    expect(invisible).toContain("dialog-focus-restore");
  });

  it("treats role and naming as statically checkable", () => {
    const requirements = predictRequirements("dialog", "");
    const role = requirements.find((r) => r.id === "dialog-role")!;

    expect(role.staticallyUndetectable).toBe(false);
  });

  it("counts undetectable gaps in the summary", () => {
    const result = forecast(CHAT_PANEL_BEFORE)!;
    expect(result.summary).toContain("no scanner will catch");
  });
});

describe("forecast", () => {
  it("reproduces the real gaps in the shipped ChatPanel", () => {
    const result = forecast(CHAT_PANEL_BEFORE)!;
    const missing = result.missing.map((r) => r.id);

    // Exactly the defects found by review: no dialog role, no Escape, no focus restore.
    expect(missing).toContain("dialog-role");
    expect(missing).toContain("dialog-escape");
    expect(missing).toContain("dialog-focus-restore");
    // It did already have an accessible name.
    expect(missing).not.toContain("dialog-name");
  });

  it("confirms a complete implementation", () => {
    const result = forecast(DIALOG_DONE)!;

    expect(result.missing).toHaveLength(0);
    expect(result.summary).toContain("meets the ARIA Authoring Practices");
  });

  it("returns nothing when no pattern is present", () => {
    expect(forecast("const x = 1;")).toBeNull();
  });
});
