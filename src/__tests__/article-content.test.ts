/**
 * Unit tests for the DB-article → display-content mapper that lets the public
 * blog render CMS articles (not just the seeded static ones).
 */
import { describe, it, expect } from "vitest";
import { categoryColorFor, formatArticleDate, dbArticleToContent } from "@/lib/blog/articleContent";

describe("categoryColorFor", () => {
  it("maps known categories to their seeded pill colors", () => {
    expect(categoryColorFor("WCAG")).toContain("blue");
    expect(categoryColorFor("EAA")).toContain("violet");
    expect(categoryColorFor("Legal")).toContain("amber");
    expect(categoryColorFor("Technical")).toContain("emerald");
  });
  it("falls back to a neutral color for unknown categories", () => {
    expect(categoryColorFor("Totally New Category")).toContain("neutral");
  });
});

describe("formatArticleDate", () => {
  it("formats a Date and an ISO string", () => {
    expect(formatArticleDate(new Date("2026-05-28T00:00:00Z"))).toMatch(/2026/);
    expect(formatArticleDate("2026-05-28T12:00:00Z")).toMatch(/May/);
  });
  it("returns empty string for null/invalid", () => {
    expect(formatArticleDate(null)).toBe("");
    expect(formatArticleDate(undefined)).toBe("");
    expect(formatArticleDate("not-a-date")).toBe("");
  });
});

describe("dbArticleToContent", () => {
  const base = {
    slug: "my-post",
    title: "My Post",
    excerpt: "An excerpt",
    category: "WCAG",
    readTime: "7 min read",
    publishedAt: new Date("2026-05-28T00:00:00Z"),
  };

  it("maps a DB row to the display shape with derived color + date", () => {
    const c = dbArticleToContent({ ...base, content: { sections: [{ id: "a", title: "T", paragraphs: ["p"] }] } });
    expect(c.title).toBe("My Post");
    expect(c.categoryColor).toContain("blue");
    expect(c.date).toMatch(/2026/);
    expect(c.sections).toHaveLength(1);
    expect(c.sections[0].id).toBe("a");
  });

  it("tolerates missing/garbage content by yielding an empty section list", () => {
    expect(dbArticleToContent({ ...base, content: null }).sections).toEqual([]);
    expect(dbArticleToContent({ ...base, content: {} }).sections).toEqual([]);
    expect(dbArticleToContent({ ...base, content: { sections: "nope" } }).sections).toEqual([]);
  });

  it("defaults readTime when blank", () => {
    expect(dbArticleToContent({ ...base, readTime: "", content: { sections: [] } }).readTime).toBe("5 min read");
  });
});
