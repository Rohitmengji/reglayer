/**
 * The bug this pins down: a chat message containing a NUL byte took down the whole
 * save with `invalid byte sequence for encoding "UTF8": 0x00`, returned a 500 with no
 * body, and lost the conversation. Found by sending \u0000 through the composer.
 *
 * The tests below care about two things in tension — that nothing which reaches the
 * database can be unencodable, and that ordinary text (including emoji, which are
 * surrogate pairs) survives untouched. A sanitiser that mangles emoji would trade one
 * data-loss bug for a quieter one.
 */
import { describe, it, expect } from "vitest";
import { stripUnstorableChars } from "@/lib/ai/chat/db-safe-text";

describe("stripUnstorableChars", () => {
  it("removes the NUL byte that Postgres rejects", () => {
    expect(stripUnstorableChars("before\u0000after")).toBe("beforeafter");
  });

  it("removes several NULs, including leading and trailing ones", () => {
    expect(stripUnstorableChars("\u0000a\u0000\u0000b\u0000")).toBe("ab");
  });

  it("leaves ordinary text exactly as it was", () => {
    const text = "How do I fix contrast on <div class=\"x\">? See SC 1.4.3 — 4.5:1.";
    expect(stripUnstorableChars(text)).toBe(text);
  });

  it("preserves newlines and tabs, which are meaningful in chat and legal in Postgres", () => {
    expect(stripUnstorableChars("line1\nline2\tend")).toBe("line1\nline2\tend");
  });

  it("preserves emoji and other astral characters, which are valid surrogate PAIRS", () => {
    // A sanitiser that stripped the surrogate range wholesale would eat these.
    const text = "ok 👍 𝔘nicode 🎨";
    expect(stripUnstorableChars(text)).toBe(text);
  });

  it("removes a high surrogate with no low surrogate after it", () => {
    expect(stripUnstorableChars("a\uD800b")).toBe("ab");
  });

  it("removes a low surrogate with no high surrogate before it", () => {
    expect(stripUnstorableChars("a\uDC00b")).toBe("ab");
  });

  it("removes a trailing lone high surrogate — the shape left by naive string slicing", () => {
    expect(stripUnstorableChars("truncated\uD83D")).toBe("truncated");
  });

  it("is a no-op on empty input", () => {
    expect(stripUnstorableChars("")).toBe("");
  });

  it("produces a string that always encodes cleanly to UTF-8", () => {
    const hostile = "a\u0000b\uD800c\uDC00d👍e";
    const cleaned = stripUnstorableChars(hostile);
    // Round-tripping through UTF-8 is exactly what the database driver does; if any
    // unpaired surrogate survived, this would come back with a replacement character.
    const roundTripped = Buffer.from(cleaned, "utf8").toString("utf8");
    expect(roundTripped).toBe(cleaned);
    expect(cleaned).not.toContain("\uFFFD");
    expect(cleaned).toBe("abcd👍e");
  });
});
