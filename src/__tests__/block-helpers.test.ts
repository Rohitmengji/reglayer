/**
 * Unit tests for the blog block helpers (pure): URL sanitizer, block factory,
 * and content validation that guards the save route.
 */

import { describe, it, expect } from "vitest";
import { safeUrl, createBlock, validateArticleContent, BLOCK_TYPES } from "@/lib/blog/blockHelpers";

describe("safeUrl", () => {
  it("allows http(s), mailto, root-relative, and anchors", () => {
    expect(safeUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeUrl("/pricing")).toBe("/pricing");
    expect(safeUrl("#section")).toBe("#section");
  });

  it("upgrades a bare domain to https", () => {
    expect(safeUrl("example.com/path")).toBe("https://example.com/path");
    expect(safeUrl("sub.example.co.uk")).toBe("https://sub.example.co.uk");
  });

  it("rejects dangerous or unknown schemes", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("JAVASCRIPT:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,<script>")).toBe("");
    expect(safeUrl("vbscript:msgbox")).toBe("");
    expect(safeUrl("  ")).toBe("");
    expect(safeUrl("")).toBe("");
  });
});

describe("createBlock", () => {
  it("creates each block type with its primary field and the given id", () => {
    expect(createBlock("text", "x").paragraphs.length).toBeGreaterThan(0);
    expect(createBlock("list", "x").list).toBeDefined();
    expect(createBlock("image", "x").image).toEqual({ url: "", alt: "" });
    expect(createBlock("quote", "x").quote).toBeDefined();
    expect(createBlock("callout", "x").callout).toBeDefined();
    expect(createBlock("code", "x").code).toBe("");
    expect(createBlock("button", "x").button?.label).toBeTruthy();
    expect(createBlock("divider", "x").divider).toBe(true);
    expect(createBlock("image", "abc").id).toBe("abc");
  });

  it("every catalog block type is creatable", () => {
    for (const b of BLOCK_TYPES) {
      const block = createBlock(b.type, "id");
      expect(block.id).toBe("id");
      expect(typeof block.title).toBe("string");
      expect(Array.isArray(block.paragraphs)).toBe(true);
    }
  });
});

describe("validateArticleContent", () => {
  const valid = { sections: [{ id: "a", title: "T", paragraphs: ["p"] }] };

  it("accepts well-formed content", () => {
    const r = validateArticleContent(valid);
    expect(r.ok).toBe(true);
  });

  it("rejects non-objects and missing sections array", () => {
    expect(validateArticleContent(null).ok).toBe(false);
    expect(validateArticleContent("x").ok).toBe(false);
    expect(validateArticleContent({}).ok).toBe(false);
    expect(validateArticleContent({ sections: "nope" }).ok).toBe(false);
  });

  it("rejects sections missing id/title or with non-array paragraphs", () => {
    expect(validateArticleContent({ sections: [{ title: "T", paragraphs: [] }] }).ok).toBe(false);
    expect(validateArticleContent({ sections: [{ id: "a", paragraphs: [] }] }).ok).toBe(false);
    expect(validateArticleContent({ sections: [{ id: "a", title: "T", paragraphs: "no" }] }).ok).toBe(false);
  });

  it("rejects an absurd number of sections", () => {
    const many = { sections: Array.from({ length: 201 }, (_, i) => ({ id: `${i}`, title: "T", paragraphs: [] })) };
    expect(validateArticleContent(many).ok).toBe(false);
  });
});
