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
  | "image"
  | "quote"
  | "callout"
  | "code"
  | "button"
  | "divider";

export interface BlockTypeMeta {
  type: BlockType;
  label: string;
  /** One-line hint shown to non-technical editors. */
  hint: string;
}

/** The blocks a client can add, in the order shown in the picker. */
export const BLOCK_TYPES: BlockTypeMeta[] = [
  { type: "text", label: "Heading + text", hint: "A titled section with one or more paragraphs" },
  { type: "list", label: "Bulleted list", hint: "A list of short points" },
  { type: "image", label: "Image", hint: "A picture, with alt text for screen-reader users" },
  { type: "quote", label: "Quote", hint: "A highlighted quotation with optional attribution" },
  { type: "callout", label: "Callout / note", hint: "A boxed tip, note, or warning" },
  { type: "code", label: "Code", hint: "A monospaced code snippet" },
  { type: "button", label: "Button / link", hint: "A call-to-action button" },
  { type: "divider", label: "Divider", hint: "A horizontal line to separate content" },
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
    case "image":
      return { ...base, image: { url: "", alt: "" } };
    case "quote":
      return { ...base, quote: { text: "", attribution: "" } };
    case "callout":
      return { ...base, callout: { title: "Note", body: "" } };
    case "code":
      return { ...base, code: "" };
    case "button":
      return { ...base, button: { label: "Learn more", url: "" } };
    case "divider":
      return { ...base, divider: true };
    default:
      return base;
  }
}

/** Human label for whichever block kind a section primarily represents. */
export function blockKindLabel(section: ArticleSection): string {
  if (section.image) return "Image";
  if (section.quote) return "Quote";
  if (section.button) return "Button";
  if (section.divider) return "Divider";
  if (section.code) return "Code";
  if (section.callout) return "Callout";
  if (section.list && !section.paragraphs?.length) return "List";
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
