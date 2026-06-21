/**
 * RegLayer — Blog block helpers (pure, testable)
 *
 * WHY: The article editor lets non-technical clients build content from BLOCKS
 *      (heading+text, list, image, quote, callout, code, button, divider) instead
 *      of needing a developer. These helpers create blocks and sanitize the URLs
 *      clients type, with NO React/server imports so they're unit-testable and
 *      shared between the editor and the public renderer.
 * WHAT: BLOCK_TYPES catalog, createBlock(), safeUrl(), and content validation.
 * HOW: Each block is an ArticleSection with the relevant optional field set, so
 *      the existing section-array model and public renderer stay backward-compatible.
 */

import type { ArticleSection } from "@/app/blog/[slug]/content";

export type BlockType =
  | "text"
  | "list"
  | "numbered"
  | "image"
  | "quote"
  | "callout"
  | "code"
  | "button"
  | "divider"
  | "video"
  | "table"
  | "accordion"
  | "stats";

export interface BlockTypeMeta {
  type: BlockType;
  label: string;
  /** One-line hint shown to non-technical editors. */
  hint: string;
  /** Coarse grouping shown as a section header in the block picker. */
  group: "Text" | "Media" | "Data" | "Layout";
}

/** The blocks a client can add, grouped + in the order shown in the picker. */
export const BLOCK_TYPES: BlockTypeMeta[] = [
  { type: "text", label: "Heading + text", hint: "A titled section with one or more paragraphs", group: "Text" },
  { type: "list", label: "Bulleted list", hint: "A list of short points", group: "Text" },
  { type: "numbered", label: "Numbered list", hint: "A step-by-step ordered list", group: "Text" },
  { type: "quote", label: "Quote", hint: "A highlighted quotation with optional attribution", group: "Text" },
  { type: "callout", label: "Callout / note", hint: "A boxed tip, note, warning, or success message", group: "Text" },
  { type: "code", label: "Code", hint: "A monospaced code snippet", group: "Text" },
  { type: "image", label: "Image", hint: "A picture, with alt text for screen-reader users", group: "Media" },
  { type: "video", label: "Video", hint: "Embed a YouTube or Vimeo video", group: "Media" },
  { type: "table", label: "Table", hint: "Rows and columns of data", group: "Data" },
  { type: "stats", label: "Stat highlights", hint: "A row of big numbers with labels", group: "Data" },
  { type: "accordion", label: "FAQ / accordion", hint: "Collapsible question-and-answer items", group: "Data" },
  { type: "button", label: "Button / link", hint: "A call-to-action button", group: "Layout" },
  { type: "divider", label: "Divider", hint: "A horizontal line to separate content", group: "Layout" },
];

/**
 * Sanitize a user-supplied URL: allow only http(s), mailto, root-relative, and
 * in-page anchors; upgrade bare domains to https; reject everything else
 * (javascript:, data:, vbscript:, …) by returning "". Used for image src + links.
 */
export function safeUrl(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  // Explicit safe schemes + in-page anchors.
  if (/^(https?:\/\/|mailto:|#)/i.test(u)) return u;
  // Root-relative path: a single leading "/" NOT followed by another "/"
  // (so protocol-relative "//evil.com" — an off-site navigation — is rejected).
  if (/^\/(?!\/)/.test(u)) return u;
  // Bare domain like "example.com/path" → assume https.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?|#)/i.test(u)) return `https://${u}`;
  return "";
}

const YT_ID = /^[a-zA-Z0-9_-]{6,15}$/;
const VIMEO_ID = /^\d{6,12}$/;

/**
 * Turn a client-pasted YouTube/Vimeo URL into a safe, privacy-friendly EMBED
 * URL — or return "" for anything else. The provider is matched by the URL's
 * HOST (not a substring), so a deceptive URL like "https://evil.com/youtu.be/X"
 * or "https://youtube.com.evil.com/..." can never produce an embed. Wrapped in
 * try/catch so it stays pure and never throws.
 */
export function safeVideoEmbed(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = parsed.searchParams.get("v");
    if (v && YT_ID.test(v)) return `https://www.youtube-nocookie.com/embed/${v}`;
    const m = parsed.pathname.match(/^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{6,15})/);
    if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    return "";
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\//, "").split("/")[0];
    if (YT_ID.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    return "";
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = parsed.pathname.match(/(\d{6,12})/);
    if (m && VIMEO_ID.test(m[1])) return `https://player.vimeo.com/video/${m[1]}`;
    return "";
  }
  return "";
}

let blockSeq = 0;
/** Generate a stable-enough unique block id (client-side only). */
export function genBlockId(): string {
  blockSeq += 1;
  // Deterministic-ish: time + counter. Not used in workflow scripts.
  return `b-${Date.now().toString(36)}-${blockSeq}`;
}

/**
 * Create a fresh block (ArticleSection) of the given type, pre-populated with
 * friendly placeholder content. `id` is injected so this stays pure/testable.
 */
export function createBlock(type: BlockType, id: string): ArticleSection {
  const base: ArticleSection = { id, title: "", paragraphs: [] };
  switch (type) {
    case "text":
      return { ...base, title: "New section", paragraphs: ["Write your text here…"] };
    case "list":
      return { ...base, list: ["First point", "Second point"] };
    case "numbered":
      return { ...base, list: ["First step", "Second step"], ordered: true };
    case "image":
      return { ...base, image: { url: "", alt: "" } };
    case "quote":
      return { ...base, quote: { text: "", attribution: "" } };
    case "callout":
      return { ...base, callout: { title: "Note", body: "", variant: "note" } };
    case "code":
      return { ...base, code: "" };
    case "button":
      return { ...base, button: { label: "Learn more", url: "" } };
    case "divider":
      return { ...base, divider: true };
    case "video":
      return { ...base, video: { url: "", title: "" } };
    case "table":
      return {
        ...base,
        table: {
          headers: ["Column 1", "Column 2"],
          rows: [
            ["", ""],
            ["", ""],
          ],
        },
      };
    case "accordion":
      return {
        ...base,
        accordion: [
          { q: "First question?", a: "Answer goes here." },
          { q: "Second question?", a: "Answer goes here." },
        ],
      };
    case "stats":
      return { ...base, stats: [makeStat(), makeStat(), makeStat()] };
    default:
      return base;
  }
}

/** A neutral default stat for client-created Stat-highlight blocks. */
function makeStat() {
  return {
    value: "0",
    label: "Metric",
    color: "text-accent",
    labelColor: "text-neutral-600 dark:text-neutral-300",
    bg: "bg-neutral-50 dark:bg-neutral-900",
    border: "border-neutral-200 dark:border-neutral-700",
  };
}

/** Human label for whichever block kind a section primarily represents. */
export function blockKindLabel(section: ArticleSection): string {
  if (section.image) return "Image";
  if (section.video) return "Video";
  if (section.table) return "Table";
  if (section.accordion) return "FAQ";
  if (section.stats) return "Stats";
  if (section.quote) return "Quote";
  if (section.button) return "Button";
  if (section.divider) return "Divider";
  if (section.code !== undefined && section.code !== null) return "Code";
  if (section.callout) return "Callout";
  if (section.list && !section.paragraphs?.length) return section.ordered ? "Numbered list" : "List";
  return "Text";
}

/**
 * Validate that a value is a well-formed article content object before it's
 * persisted. Defensive: the save route is admin-only but should still never
 * store a shape the renderer can't handle. Returns a typed result.
 */
export function validateArticleContent(
  value: unknown,
): { ok: true; sections: ArticleSection[] } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "content must be an object" };
  const sections = (value as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return { ok: false, error: "content.sections must be an array" };
  if (sections.length > 200) return { ok: false, error: "too many sections (max 200)" };
  for (const s of sections) {
    if (!s || typeof s !== "object") return { ok: false, error: "each section must be an object" };
    const sec = s as Record<string, unknown>;
    if (typeof sec.id !== "string" || typeof sec.title !== "string") {
      return { ok: false, error: "each section needs string id + title" };
    }
    if (!Array.isArray(sec.paragraphs)) return { ok: false, error: "section.paragraphs must be an array" };
    // Deep-check every block kind the public renderer will .map / read, so a
    // malformed-but-truthy field (e.g. table:{}, list:"x", a non-string paragraph)
    // can never reach — and crash — the server-component renderer.
    const blockErr = validateBlockShapes(sec);
    if (blockErr) return { ok: false, error: blockErr };
  }
  return { ok: true, sections: sections as ArticleSection[] };
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Returns an error string if any present block field is the wrong shape, else null. */
function validateBlockShapes(sec: Record<string, unknown>): string | null {
  if (!isStringArray(sec.paragraphs)) return "section.paragraphs must be an array of strings";
  if (sec.list !== undefined && !isStringArray(sec.list)) return "section.list must be an array of strings";
  if (sec.code !== undefined && typeof sec.code !== "string") return "section.code must be a string";
  if (sec.divider !== undefined && typeof sec.divider !== "boolean") return "section.divider must be a boolean";
  if (sec.ordered !== undefined && typeof sec.ordered !== "boolean") return "section.ordered must be a boolean";

  if (sec.image !== undefined) {
    const im = sec.image as Record<string, unknown>;
    if (!im || typeof im.url !== "string" || typeof im.alt !== "string") return "section.image must be { url, alt } strings";
  }
  if (sec.video !== undefined) {
    const v = sec.video as Record<string, unknown>;
    if (!v || typeof v.url !== "string" || (v.title !== undefined && typeof v.title !== "string")) return "section.video must be { url, title? }";
  }
  if (sec.quote !== undefined) {
    const q = sec.quote as Record<string, unknown>;
    if (!q || typeof q.text !== "string" || (q.attribution !== undefined && typeof q.attribution !== "string")) return "section.quote must be { text, attribution? }";
  }
  if (sec.button !== undefined) {
    const b = sec.button as Record<string, unknown>;
    if (!b || typeof b.label !== "string" || typeof b.url !== "string") return "section.button must be { label, url } strings";
  }
  if (sec.callout !== undefined) {
    const c = sec.callout as Record<string, unknown>;
    if (!c || typeof c.title !== "string" || typeof c.body !== "string") return "section.callout must be { title, body } strings";
  }
  if (sec.stats !== undefined) {
    if (!Array.isArray(sec.stats)) return "section.stats must be an array";
    for (const st of sec.stats as unknown[]) {
      const o = st as Record<string, unknown>;
      if (!o || typeof o.value !== "string" || typeof o.label !== "string") return "each stat must have string value + label";
    }
  }
  if (sec.accordion !== undefined) {
    if (!Array.isArray(sec.accordion)) return "section.accordion must be an array";
    for (const it of sec.accordion as unknown[]) {
      const o = it as Record<string, unknown>;
      if (!o || typeof o.q !== "string" || typeof o.a !== "string") return "each FAQ item must have string q + a";
    }
  }
  if (sec.table !== undefined) {
    const t = sec.table as Record<string, unknown>;
    if (!t || !isStringArray(t.headers)) return "section.table.headers must be an array of strings";
    if (!Array.isArray(t.rows) || !(t.rows as unknown[]).every(isStringArray)) return "section.table.rows must be an array of string arrays";
  }
  return null;
}
