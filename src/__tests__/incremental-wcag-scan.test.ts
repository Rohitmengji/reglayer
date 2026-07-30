/**
 * A fabricated WCAG criterion — "SC 5.2.1" in a compliance tool — is the highest-stakes
 * thing the assistant can emit, and the full guardrail suite only runs after the stream
 * ends. This locks the incremental scan that flags it mid-answer: it must fire once, on
 * the chunk that COMPLETES a bad criterion (criteria split across chunks are common in a
 * token stream), and never on valid ones.
 *
 * The scan reuses `wcagHallucinationGuard` so the streaming check and the authoritative
 * post-stream check cannot drift. These tests exercise the exact loop shape the route
 * runs: accumulate, scan the accumulation, warn at most once.
 */
import { describe, it, expect, vi } from "vitest";

// The guardrails module is server-only; the guard itself is a pure function. Stub the
// marker the way every other AI test in this suite does.
vi.mock("server-only", () => ({}));

import { wcagHallucinationGuard } from "@/lib/ai/guardrails";

/** Mirror of the route's per-chunk scan: returns the first chunk index that warns. */
function firstWarningChunk(chunks: string[]): number {
  let full = "";
  for (let i = 0; i < chunks.length; i++) {
    full += chunks[i];
    // The route guards with a `warned` flag so it emits once; this helper returns on
    // the first warning, so the flag would be dead code (CodeQL flagged exactly that).
    // The "warn at most once" property is covered by its own test below.
    if (wcagHallucinationGuard(full, { feature: "chat", userMessage: "" }).severity === "warn") {
      return i;
    }
  }
  return -1;
}

describe("incremental WCAG hallucination scan", () => {
  it("flags a fabricated criterion that arrives whole in one chunk", () => {
    expect(firstWarningChunk(["The rule is SC 5.2.1 here."])).toBe(0);
  });

  it("flags a fabricated criterion even when it is split across chunks", () => {
    // A token stream routinely breaks "SC 5." from "2.1". The scan runs on accumulated
    // text, so it only fires once the number is complete — on the chunk that finishes it.
    expect(firstWarningChunk(["See SC 5.", "2", ".1 for details"])).toBe(2);
  });

  it("does not flag a valid criterion", () => {
    expect(firstWarningChunk(["Use SC 1.4.3 Contrast (Minimum) at AA."])).toBe(-1);
  });

  it("does not flag ordinary prose or version numbers", () => {
    expect(firstWarningChunk(["WCAG 2.2 has 13 guidelines across 4 principles."])).toBe(-1);
  });

  it("warns at most once even when several bad criteria follow", () => {
    let full = "";
    let warnings = 0;
    let warned = false;
    for (const chunk of ["Bad SC 9.9.9", " and also SC 8.8.8", " plus SC 7.7.7"]) {
      full += chunk;
      if (!warned) {
        if (wcagHallucinationGuard(full, { feature: "chat", userMessage: "" }).severity === "warn") {
          warned = true;
          warnings += 1;
        }
      }
    }
    expect(warnings).toBe(1);
  });
});
