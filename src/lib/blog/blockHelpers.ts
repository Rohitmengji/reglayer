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
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(u)) return u;
  // Bare domain like "example.com/path" → assume https.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?|#)/i.test(u)) return `https://${u}`;
  return "";
}

/**
 * Turn a client-pasted YouTube/Vimeo URL into a safe, privacy-friendly EMBED
 * URL — or return "" for anything else. Only these two providers are allowed,
 * so a client can never inject an arbitrary iframe src. Regex-based (no `new
 * URL`) so it stays pure and never throws.
 */
export function safeVideoEmbed(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  // YouTube: watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID
  const yt = u.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,15})/i
  );
  if (yt?.[1]) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  // Vimeo: vimeo.com/ID or player.vimeo.com/video/ID
  const vimeo = u.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/i);
  if (vimeo?.[1]) return `https://player.vimeo.com/video/${vimeo[1]}`;
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
  }
  return { ok: true, sections: sections as ArticleSection[] };
}
