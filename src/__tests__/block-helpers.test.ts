/**
 * Unit tests for the blog block helpers (pure): URL sanitizer, block factory,
 * and content validation that guards the save route.
 */

import { describe, it, expect } from "vitest";
import { safeUrl, safeVideoEmbed, createBlock, validateArticleContent, blockKindLabel, BLOCK_TYPES } from "@/lib/blog/blockHelpers";

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

  it("rejects protocol-relative //host (off-site navigation) but keeps root-relative", () => {
    expect(safeUrl("//evil.com/x")).toBe("");
    expect(safeUrl("//evil.com")).toBe("");
    expect(safeUrl("/pricing")).toBe("/pricing"); // single-slash root-relative still allowed
  });
});

describe("safeVideoEmbed", () => {
  it("converts YouTube watch / short / embed / youtu.be URLs to a nocookie embed", () => {
    expect(safeVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(safeVideoEmbed("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(safeVideoEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(safeVideoEmbed("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(safeVideoEmbed("https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("converts Vimeo URLs to a player embed", () => {
    expect(safeVideoEmbed("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(safeVideoEmbed("https://player.vimeo.com/video/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });

  it("rejects non-YouTube/Vimeo and dangerous URLs (no arbitrary iframe src)", () => {
    expect(safeVideoEmbed("https://evil.com/embed/x")).toBe("");
    expect(safeVideoEmbed("javascript:alert(1)")).toBe("");
    expect(safeVideoEmbed("https://youtube.com.evil.com/watch?v=abcdef")).toBe("");
    expect(safeVideoEmbed("")).toBe("");
    expect(safeVideoEmbed("  ")).toBe("");
  });

  it("matches the provider by HOST, not substring — deceptive URLs are rejected", () => {
    // These all embed the provider name as a path/query substring on a foreign host.
    expect(safeVideoEmbed("https://evil.com/youtube.com/embed/ABCDEF")).toBe("");
    expect(safeVideoEmbed("https://evil.com/?x=youtu.be/ABCDEF")).toBe("");
    expect(safeVideoEmbed("https://notyoutube.com/embed/ABCDEFG")).toBe("");
    expect(safeVideoEmbed("https://myvimeo.com/123456")).toBe("");
    expect(safeVideoEmbed("data:text/html,youtu.be/ABCDEFG")).toBe("");
    // …while the real hosts still resolve.
    expect(safeVideoEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
});

describe("createBlock", () => {
  it("creates each block type with its primary field and the given id", () => {
    expect(createBlock("text", "x").paragraphs.length).toBeGreaterThan(0);
    expect(createBlock("list", "x").list).toBeDefined();
    expect(createBlock("numbered", "x").ordered).toBe(true);
    expect(createBlock("numbered", "x").list?.length).toBeGreaterThan(0);
    expect(createBlock("image", "x").image).toEqual({ url: "", alt: "" });
    expect(createBlock("quote", "x").quote).toBeDefined();
    expect(createBlock("callout", "x").callout?.variant).toBe("note");
    expect(createBlock("code", "x").code).toBe("");
    expect(createBlock("button", "x").button?.label).toBeTruthy();
    expect(createBlock("divider", "x").divider).toBe(true);
    expect(createBlock("video", "x").video).toEqual({ url: "", title: "" });
    expect(createBlock("table", "x").table?.headers.length).toBe(2);
    expect(createBlock("table", "x").table?.rows.length).toBe(2);
    expect(createBlock("accordion", "x").accordion?.length).toBeGreaterThan(0);
    expect(createBlock("stats", "x").stats?.length).toBe(3);
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

  it("every catalog block type has a known group", () => {
    for (const b of BLOCK_TYPES) {
      expect(["Text", "Media", "Data", "Layout"]).toContain(b.group);
    }
  });
});

describe("blockKindLabel", () => {
  it("labels the new block kinds", () => {
    expect(blockKindLabel(createBlock("numbered", "x"))).toBe("Numbered list");
    expect(blockKindLabel(createBlock("list", "x"))).toBe("List");
    expect(blockKindLabel(createBlock("video", "x"))).toBe("Video");
    expect(blockKindLabel(createBlock("table", "x"))).toBe("Table");
    expect(blockKindLabel(createBlock("accordion", "x"))).toBe("FAQ");
    expect(blockKindLabel(createBlock("stats", "x"))).toBe("Stats");
    expect(blockKindLabel(createBlock("code", "x"))).toBe("Code");
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

  it("deep-rejects malformed block shapes that would crash the renderer", () => {
    const bad = (extra: Record<string, unknown>) => ({ sections: [{ id: "a", title: "T", paragraphs: [], ...extra }] });
    expect(validateArticleContent(bad({ paragraphs: [1, 2] })).ok).toBe(false); // non-string paragraph
    expect(validateArticleContent(bad({ list: "nope" })).ok).toBe(false);
    expect(validateArticleContent(bad({ table: {} })).ok).toBe(false); // headers not an array
    expect(validateArticleContent(bad({ table: { headers: ["A"], rows: "x" } })).ok).toBe(false);
    expect(validateArticleContent(bad({ stats: [{ label: "x" }] })).ok).toBe(false); // missing value
    expect(validateArticleContent(bad({ accordion: [{ q: "x" }] })).ok).toBe(false); // missing a
    expect(validateArticleContent(bad({ image: { url: "u" } })).ok).toBe(false); // missing alt
  });

  it("accepts well-formed new block shapes", () => {
    const good = {
      sections: [
        { id: "a", title: "T", paragraphs: ["p"], list: ["x"], ordered: true },
        { id: "b", title: "T", paragraphs: [], table: { headers: ["A", "B"], rows: [["1", "2"]] } },
        { id: "c", title: "T", paragraphs: [], accordion: [{ q: "Q", a: "A" }] },
        { id: "d", title: "T", paragraphs: [], video: { url: "https://youtu.be/x", title: "v" } },
      ],
    };
    expect(validateArticleContent(good).ok).toBe(true);
  });
});
