/**
 * Unit tests for the shared email layout primitives.
 *
 * These build every RegLayer transactional email, so their structure (a real
 * HTML document, a hidden/escaped preheader, a branded header and footer, a
 * bulletproof button, and correctly-toned callouts) is pinned here.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  escapeHtml,
  emailAppUrl,
  emailParagraph,
  emailButton,
  emailStatTable,
  emailCallout,
  emailManagePrefs,
  renderEmailLayout,
  EMAIL_ACCENT,
} from "@/lib/email/layout";

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
beforeEach(() => { process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com"; });
afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>"a" & 'b'</script>`)).toBe(
      "&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;",
    );
  });
});

describe("emailAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL", () => {
    expect(emailAppUrl()).toBe("https://app.example.com");
  });
  it("strips any trailing slashes", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com///";
    expect(emailAppUrl()).toBe("https://app.example.com");
  });
  it("falls back to the default when unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(emailAppUrl()).toBe("https://reglayer.vercel.app");
  });
});

describe("emailParagraph", () => {
  it("wraps content and distinguishes muted from default", () => {
    expect(emailParagraph("hello")).toContain(">hello</p>");
    expect(emailParagraph("hi", { muted: true })).toContain("color:#64748b");
    expect(emailParagraph("hi")).not.toContain("color:#64748b");
  });
});

describe("emailButton", () => {
  it("renders a bulletproof table anchor with the accent, href and label", () => {
    const html = emailButton("https://x.test/go", "Do it");
    expect(html).toContain(`bgcolor="${EMAIL_ACCENT}"`);
    expect(html).toContain(`href="https://x.test/go"`);
    expect(html).toContain(">Do it</a>");
    expect(html).toContain("<table");
  });
});

describe("emailStatTable", () => {
  it("renders each row's label and value and applies a value colour", () => {
    const html = emailStatTable([
      { label: "Score", value: "92%", valueColor: "#16a34a" },
      { label: "Sites", value: "3" },
    ]);
    expect(html).toContain(">Score</td>");
    expect(html).toContain("color:#16a34a");
    expect(html).toContain(">92%</td>");
    expect(html).toContain(">Sites</td>");
    expect(html).toContain(">3</td>");
  });
  it("rounds only the outer corners", () => {
    const html = emailStatTable([{ label: "a", value: "1" }, { label: "b", value: "2" }]);
    expect(html).toContain("border-radius:8px 0 0 0;");
    expect(html).toContain("border-radius:0 0 8px 0;");
  });
});

describe("emailCallout", () => {
  it.each([
    ["danger", "#fef2f2"],
    ["success", "#f0fdf4"],
    ["warning", "#fffbeb"],
    ["neutral", "#f8fafc"],
  ] as const)("applies the %s palette", (tone, bg) => {
    const html = emailCallout("body", tone);
    expect(html).toContain(`background:${bg}`);
    expect(html).toContain("body");
  });
  it("defaults to the neutral tone", () => {
    expect(emailCallout("x")).toContain("background:#f8fafc");
  });
});

describe("emailManagePrefs", () => {
  it("links to the notifications settings", () => {
    expect(emailManagePrefs()).toContain("https://app.example.com/notifications");
  });
});

describe("renderEmailLayout", () => {
  const html = () => renderEmailLayout({
    preheader: "<preview> & summary",
    title: "Hello there",
    contentHtml: "<p>body content</p>",
    footnote: "a footnote",
  });

  it("is a complete, email-client-ready HTML document", () => {
    const out = html();
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain('name="color-scheme"');
    expect(out).toContain('name="viewport"');
  });

  it("hides and escapes the preheader for the inbox preview", () => {
    const out = html();
    expect(out).toContain("mso-hide:all");
    expect(out).toContain("&lt;preview&gt; &amp; summary");
    expect(out).not.toContain("<preview>");
  });

  it("renders the branded header, title, content and footer", () => {
    const out = html();
    expect(out).toContain("RegLayer");
    expect(out).toContain("Hello there");
    expect(out).toContain("<p>body content</p>");
    expect(out).toContain("a footnote");
    expect(out).toContain("web accessibility");
    expect(out).toContain(String(new Date().getFullYear()));
    expect(out).toContain("app.example.com");
  });

  it("omits the footnote row when none is given", () => {
    const out = renderEmailLayout({ preheader: "p", title: "t", contentHtml: "c" });
    expect(out).toContain("c");
    expect(out).not.toContain("padding:18px 8px 0;");
  });
});
