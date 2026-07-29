/**
 * Inline accessibility suggestions.
 *
 * Detecting a missing accessible name is trivial. Knowing when NOT to say so is what
 * decides whether this feature survives a week, so the suppression cases are tested far
 * more heavily than the detection.
 */

import { describe, it, expect } from "vitest";
import {
  buildNameActions,
  hasAccessibleName,
  isReadyToDiagnose,
  parseElement,
  SETTLE_DELAY_MS,
  shouldSuggest,
  type ElementSnapshot,
} from "@/lib/ai/ide/inline-suggestion";

function element(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return {
    tag: "button",
    attributes: {},
    children: "",
    selfClosing: false,
    ...overrides,
  };
}

describe("staying quiet while the developer is still typing", () => {
  it("says nothing when the closing tag has not been typed", () => {
    // The dominant annoyance case: they typed <button> and are about to type "Save".
    const decision = shouldSuggest(element({ children: null }));

    expect(decision.suggest).toBe(false);
    expect(decision.reason).toBe("awaiting-content");
  });

  it("does fire for a finished self-closing element", () => {
    // <button /> is complete and genuinely nameless.
    expect(shouldSuggest(element({ selfClosing: true, children: null })).suggest).toBe(true);
  });

  it("returns nothing for a half-typed tag", () => {
    expect(parseElement("<butt")).toBeNull();
    expect(parseElement("<button onCl")).toBeNull();
  });

  it("requires both a pause and a finished element", () => {
    const finished = element({ children: "" });
    const unfinished = element({ children: null });

    // Either condition alone produces suggestions on half-written code.
    expect(isReadyToDiagnose(SETTLE_DELAY_MS - 1, finished)).toBe(false);
    expect(isReadyToDiagnose(SETTLE_DELAY_MS + 1, unfinished)).toBe(false);
    expect(isReadyToDiagnose(SETTLE_DELAY_MS + 1, finished)).toBe(true);
  });
});

describe("not claiming a name is missing when it is not", () => {
  it("accepts visible text as the name", () => {
    expect(hasAccessibleName(element({ children: "Save" }))).toBe(true);
    expect(shouldSuggest(element({ children: "Save" })).reason).toBe("has-name");
  });

  it("accepts an aria-label", () => {
    expect(hasAccessibleName(element({ attributes: { "aria-label": "Close dialog" } }))).toBe(true);
  });

  it("accepts a translated label it cannot evaluate", () => {
    // The assistant cannot resolve {t("close")} and must not claim the name is absent.
    const translated = element({ attributes: { "aria-label": 't("close")' }, children: "" });
    expect(shouldSuggest(translated).suggest).toBe(false);
  });

  it("accepts aria-labelledby", () => {
    expect(hasAccessibleName(element({ attributes: { "aria-labelledby": "title" } }))).toBe(true);
  });

  it("treats whitespace-only content as no name", () => {
    expect(hasAccessibleName(element({ children: "   \n  " }))).toBe(false);
  });

  it("ignores elements that do not need a name", () => {
    expect(shouldSuggest(element({ tag: "div" })).reason).toBe("not-applicable");
  });

  it("applies to other name-from-content elements", () => {
    expect(shouldSuggest(element({ tag: "a" })).suggest).toBe(true);
    expect(shouldSuggest(element({ tag: "summary" })).suggest).toBe(true);
  });
});

describe("the accept action", () => {
  it("offers a visible label above aria-label", () => {
    const actions = buildNameActions(element());

    // Visible text serves everyone, needs no ARIA, and cannot drift out of sync.
    expect(actions[0].title).toContain("visible label");
  });

  it("places the cursor inside the empty label", () => {
    const aria = buildNameActions(element()).find((a) => a.snippet.includes("aria-label"))!;

    // The developer's next keystroke IS the label. That is the whole interaction.
    expect(aria.snippet).toContain("${1:");
  });

  it("never claims to complete the fix", () => {
    // The editor cannot know whether this button closes a dialog or submits a form.
    // Auto-filling a guess is how tools emit aria-label="Button" at scale.
    for (const action of buildNameActions(element())) {
      expect(action.kind).toBe("scaffold");
    }
  });

  it("tells the developer what a good label looks like", () => {
    const aria = buildNameActions(element()).find((a) => a.snippet.includes("aria-label"))!;
    expect(aria.hint).toContain("Close dialog");
  });

  it("offers only aria-label for a self-closing element", () => {
    const actions = buildNameActions(element({ selfClosing: true, children: null }));

    // There is nowhere to put visible text in <button />.
    expect(actions).toHaveLength(1);
    expect(actions[0].snippet).toContain("aria-label");
  });

  it("offers nothing when suppressed", () => {
    expect(buildNameActions(element({ children: "Save" }))).toEqual([]);
    expect(buildNameActions(element({ children: null }))).toEqual([]);
  });
});

describe("element parsing", () => {
  it("reads attributes and content from a complete element", () => {
    const parsed = parseElement('<button type="button" onClick={close}>Save</button>')!;

    expect(parsed.tag).toBe("button");
    expect(parsed.attributes.type).toBe("button");
    expect(parsed.attributes.onClick).toBe("close");
    expect(parsed.children).toBe("Save");
  });

  it("marks an unclosed element so suppression can see it", () => {
    expect(parseElement("<button>")!.children).toBeNull();
  });

  it("recognises self-closing elements", () => {
    const parsed = parseElement("<button />")!;
    expect(parsed.selfClosing).toBe(true);
  });

  it("handles valueless attributes", () => {
    expect(parseElement("<button disabled>x</button>")!.attributes.disabled).toBe(true);
  });

  it("fires on an icon-only button, the case this exists for", () => {
    const parsed = parseElement("<button><XIcon /></button>")!;

    // Children are present but contain no TEXT — an icon contributes nothing to the
    // accessibility tree, so the name is still missing.
    expect(parsed.children).toBe("<XIcon />");
    expect(shouldSuggest(parsed).suggest).toBe(true);
  });

  it("stays quiet when an icon sits alongside real text", () => {
    const parsed = parseElement("<button><XIcon />Close</button>")!;
    expect(shouldSuggest(parsed).suggest).toBe(false);
  });

  it("stays quiet when the label is an expression it cannot evaluate", () => {
    // {label} almost certainly renders text; flagging it would be a false positive.
    const parsed = parseElement("<button>{label}</button>")!;
    expect(shouldSuggest(parsed).suggest).toBe(false);
  });
});
