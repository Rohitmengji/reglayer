"use client";

/**
 * RegLayer — Article Editor (Admin / Client CMS)
 *
 * WHY: Content should stay fresh without a developer. Non-technical clients edit
 * directly in the UI — add/remove/reorder blocks, change text, swap images — so
 * their own team handles minor changes and only large work needs engineering.
 *
 * WHAT:
 * - Floating "Edit" button for admin/owner users.
 * - Block editor: Heading+text, Bulleted list, Image (with required alt text),
 *   Quote, Callout, Code, Button, Divider. Add / delete / move up / move down.
 * - AI assist: describe a change, AI suggests edits.
 * - Version safety: every save snapshots the previous state (server-side).
 *
 * HOW:
 * - Controlled state; ALL block mutations use functional setState (no stale
 *   closures / lost updates when edits land quickly).
 * - POST /api/blog/[slug]/ai-edit for AI suggestions.
 * - PATCH /api/blog/[slug] to save (server always creates a version first).
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Pencil, X, Save, Sparkles, RotateCcw, AlertTriangle,
  Loader2, Plus, Trash2, ChevronUp, ChevronDown, Copy,
  Type, List, ListOrdered, Image as ImageIcon, Quote, Info, Code, Link2,
  Minus, Video, Table as TableIcon, HelpCircle, BarChart3, Lightbulb, CheckCircle2,
} from "lucide-react";
import type { ArticleSection, CalloutVariant } from "@/app/blog/[slug]/content";
import { BLOCK_TYPES, createBlock, genBlockId, blockKindLabel, safeVideoEmbed, type BlockType } from "@/lib/blog/blockHelpers";
import { isContentEditor } from "@/lib/auth/roles";

/** lucide icon for each block type, used in the add-block picker + card header. */
const BLOCK_ICON: Record<BlockType, typeof Type> = {
  text: Type,
  list: List,
  numbered: ListOrdered,
  image: ImageIcon,
  quote: Quote,
  callout: Info,
  code: Code,
  button: Link2,
  divider: Minus,
  video: Video,
  table: TableIcon,
  accordion: HelpCircle,
  stats: BarChart3,
};

/** Best-guess block type for a section, for the card header icon (mirrors blockKindLabel priority). */
function blockTypeOf(s: ArticleSection): BlockType {
  if (s.image) return "image";
  if (s.video) return "video";
  if (s.table) return "table";
  if (s.accordion) return "accordion";
  if (s.stats) return "stats";
  if (s.quote) return "quote";
  if (s.button) return "button";
  if (s.divider) return "divider";
  if (s.code !== undefined) return "code";
  if (s.callout) return "callout";
  if (s.list && !s.paragraphs?.length) return s.ordered ? "numbered" : "list";
  return "text";
}

/** Selectable callout tones shown in the editor (icon mirrors the public renderer). */
const CALLOUT_VARIANTS: Array<{ value: CalloutVariant; label: string; Icon: typeof Info }> = [
  { value: "note", label: "Note", Icon: Info },
  { value: "info", label: "Info", Icon: Info },
  { value: "tip", label: "Tip", Icon: Lightbulb },
  { value: "warning", label: "Warning", Icon: AlertTriangle },
  { value: "success", label: "Success", Icon: CheckCircle2 },
];

type Section = ArticleSection;

interface ArticleData {
  slug: string;
  title: string;
  excerpt: string;
  content: { sections: Section[] };
}

interface ArticleEditorProps {
  article: ArticleData;
  onUpdate: (updated: ArticleData) => void;
  onEditingChange?: (editing: boolean) => void;
}

export function ArticleEditor({ article, onUpdate, onEditingChange }: ArticleEditorProps) {
  const { data: session } = useSession();
  const [editing, setEditing] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ sections: Section[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  // Editable content state — starts as copy of current article
  const [editTitle, setEditTitle] = useState(article.title);
  const [editExcerpt, setEditExcerpt] = useState(article.excerpt);
  const [editSections, setEditSections] = useState<Section[]>(
    (article.content?.sections ?? []) as Section[]
  );

  if (!isContentEditor(session)) return null;

  function startEditing() {
    setEditing(true);
    onEditingChange?.(true);
    setEditTitle(article.title);
    setEditExcerpt(article.excerpt);
    setEditSections((article.content?.sections ?? []) as Section[]);
    setError(null);
    setShowBlockPicker(false);
  }

  function cancelEditing() {
    setEditing(false);
    onEditingChange?.(false);
    setAiMode(false);
    setAiSuggestion(null);
    setError(null);
    setShowBlockPicker(false);
  }

  async function saveChanges() {
    if (saving) return; // guard double-submit
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/blog/${article.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          excerpt: editExcerpt,
          content: { sections: editSections },
          editMethod: aiSuggestion ? "ai" : "manual",
          changeNote: changeNote || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      const { article: updated } = await res.json();
      onUpdate({ ...article, ...updated });
      setEditing(false);
      onEditingChange?.(false);
      setAiSuggestion(null);
      setChangeNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function requestAiEdit() {
    if (!aiInstruction.trim() || aiLoading) return;
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/blog/${article.slug}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: aiInstruction }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "AI edit failed");
      }
      const { suggestion } = await res.json();
      if (suggestion?.sections && Array.isArray(suggestion.sections)) {
        setAiSuggestion(suggestion);
        setEditSections(suggestion.sections);
      } else {
        throw new Error("AI returned an unexpected format");
      }
      setAiMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI edit failed");
    } finally {
      setAiLoading(false);
    }
  }

  function rejectAiSuggestion() {
    setAiSuggestion(null);
    setEditSections((article.content?.sections ?? []) as Section[]);
  }

  // ── Block mutations (all functional → no stale-closure / lost-update races) ──

  function patchSection(idx: number, patch: Partial<Section>) {
    setEditSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addBlock(type: BlockType) {
    setEditSections((prev) => [...prev, createBlock(type, genBlockId())]);
    setShowBlockPicker(false);
  }

  function deleteSection(idx: number) {
    setEditSections((prev) => prev.filter((_, i) => i !== idx));
  }

  function duplicateSection(idx: number) {
    setEditSections((prev) => {
      const src = prev[idx];
      if (!src) return prev;
      // Deep-ish clone + fresh id so the copy is independently editable.
      const copy: Section = JSON.parse(JSON.stringify(src));
      copy.id = genBlockId();
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  function moveSection(idx: number, dir: -1 | 1) {
    setEditSections((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function updateParagraph(sIdx: number, pIdx: number, value: string) {
    setEditSections((prev) =>
      prev.map((s, i) => (i === sIdx ? { ...s, paragraphs: s.paragraphs.map((p, j) => (j === pIdx ? value : p)) } : s))
    );
  }
  function addParagraph(sIdx: number) {
    setEditSections((prev) => prev.map((s, i) => (i === sIdx ? { ...s, paragraphs: [...(s.paragraphs ?? []), ""] } : s)));
  }
  function removeParagraph(sIdx: number, pIdx: number) {
    setEditSections((prev) =>
      prev.map((s, i) => (i === sIdx ? { ...s, paragraphs: s.paragraphs.filter((_, j) => j !== pIdx) } : s))
    );
  }

  function updateListItem(sIdx: number, iIdx: number, value: string) {
    setEditSections((prev) =>
      prev.map((s, i) => (i === sIdx ? { ...s, list: (s.list ?? []).map((it, j) => (j === iIdx ? value : it)) } : s))
    );
  }
  function addListItem(sIdx: number) {
    setEditSections((prev) => prev.map((s, i) => (i === sIdx ? { ...s, list: [...(s.list ?? []), ""] } : s)));
  }
  function removeListItem(sIdx: number, iIdx: number) {
    setEditSections((prev) =>
      prev.map((s, i) => (i === sIdx ? { ...s, list: (s.list ?? []).filter((_, j) => j !== iIdx) } : s))
    );
  }

  // Floating edit button (not editing)
  if (!editing) {
    return (
      <button
        onClick={startEditing}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-accent/90 transition-all hover:scale-105"
        title="Edit article (Admin)"
      >
        <Pencil className="h-4 w-4" />
        Edit
      </button>
    );
  }

  // Editing toolbar
  return (
    <>
      {/* Top toolbar */}
      <div className="fixed top-0 left-0 right-0 z-9999 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 shadow-sm">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
              <Pencil className="h-3 w-3" /> Edit Mode
            </span>
            {aiSuggestion && (
              <span className="flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                <Sparkles className="h-3 w-3" /> AI suggestion applied
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAiMode(!aiMode)}
              className="flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-800 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              <Sparkles className="h-3 w-3" /> AI Edit
            </button>
            <button
              onClick={cancelEditing}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            <button
              onClick={saveChanges}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-2">
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
            </div>
          </div>
        )}

        {/* AI instruction panel */}
        {aiMode && (
          <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-3">
            <div className="flex items-center gap-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/10 p-3">
              <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
              <input
                type="text"
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && requestAiEdit()}
                placeholder="Describe what to change... (e.g., 'Add a section about WCAG 3.0 timeline')"
                className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-white placeholder-neutral-400 outline-none"
                autoFocus
              />
              <button
                onClick={requestAiEdit}
                disabled={aiLoading || !aiInstruction.trim()}
                className="flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Generate
              </button>
            </div>
          </div>
        )}

        {/* AI suggestion review bar */}
        {aiSuggestion && (
          <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-3">
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 px-3 py-2">
              <span className="text-xs text-emerald-700 dark:text-emerald-400">AI suggested changes — review below, then Save or Revert</span>
              <button onClick={rejectAiSuggestion} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700">
                <RotateCcw className="h-3 w-3" /> Revert
              </button>
            </div>
          </div>
        )}

        {/* Change note */}
        <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-2">
          <input
            type="text"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="Change note (optional): What did you update?"
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Spacer for fixed toolbar */}
      <div className="h-36" />

      {/* Inline editable content */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Title */}
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          aria-label="Article title"
          className="w-full text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white bg-transparent border-b-2 border-dashed border-accent/30 focus:border-accent outline-none pb-2 mb-4"
        />

        {/* Excerpt */}
        <textarea
          value={editExcerpt}
          onChange={(e) => setEditExcerpt(e.target.value)}
          rows={2}
          aria-label="Article excerpt"
          className="w-full text-base text-neutral-600 dark:text-neutral-300 bg-transparent border-b border-dashed border-neutral-300 dark:border-neutral-700 focus:border-accent outline-none resize-none pb-2 mb-8"
        />

        {/* Blocks */}
        {editSections.map((section, si) => (
          <BlockCard
            key={section.id || si}
            section={section}
            index={si}
            total={editSections.length}
            onMove={moveSection}
            onDelete={deleteSection}
            onDuplicate={duplicateSection}
            onPatch={patchSection}
            onUpdateParagraph={updateParagraph}
            onAddParagraph={addParagraph}
            onRemoveParagraph={removeParagraph}
            onUpdateListItem={updateListItem}
            onAddListItem={addListItem}
            onRemoveListItem={removeListItem}
          />
        ))}

        {/* Add block */}
        <div className="mb-16 mt-2">
          {!showBlockPicker ? (
            <button
              onClick={() => setShowBlockPicker(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 py-3 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:border-accent hover:text-accent transition-colors"
            >
              <Plus className="h-4 w-4" /> Add block
            </button>
          ) : (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Choose a block</span>
                <button onClick={() => setShowBlockPicker(false)} aria-label="Close block picker" className="text-neutral-400 hover:text-neutral-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {(["Text", "Media", "Data", "Layout"] as const).map((group) => (
                <div key={group} className="mb-3 last:mb-0">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{group}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {BLOCK_TYPES.filter((b) => b.group === group).map((b) => {
                      const Icon = BLOCK_ICON[b.type];
                      return (
                        <button
                          key={b.type}
                          onClick={() => addBlock(b.type)}
                          title={b.hint}
                          className="flex items-start gap-2 rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-2 text-left hover:border-accent hover:bg-accent/5 transition-colors"
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">{b.label}</span>
                            <span className="mt-0.5 block text-[10px] text-neutral-400 line-clamp-2">{b.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Per-block editing card ──────────────────────────────────────────────────────

interface BlockCardProps {
  section: Section;
  index: number;
  total: number;
  onMove: (idx: number, dir: -1 | 1) => void;
  onDelete: (idx: number) => void;
  onDuplicate: (idx: number) => void;
  onPatch: (idx: number, patch: Partial<Section>) => void;
  onUpdateParagraph: (sIdx: number, pIdx: number, value: string) => void;
  onAddParagraph: (sIdx: number) => void;
  onRemoveParagraph: (sIdx: number, pIdx: number) => void;
  onUpdateListItem: (sIdx: number, iIdx: number, value: string) => void;
  onAddListItem: (sIdx: number) => void;
  onRemoveListItem: (sIdx: number, iIdx: number) => void;
}

const fieldCls =
  "w-full text-sm text-neutral-700 dark:text-neutral-300 bg-transparent border border-neutral-200 dark:border-neutral-700 rounded-md outline-none resize-none px-2.5 py-1.5 focus:ring-1 focus:ring-accent";

function BlockCard(props: BlockCardProps) {
  const { section, index: si, total } = props;
  // A "text-ish" section can add paragraphs; specialized blocks (image/quote/etc.)
  // keep their single purpose.
  const isSpecial = !!(
    section.image || section.quote || section.button || section.divider ||
    section.code !== undefined || section.callout || section.video || section.table ||
    section.accordion || section.stats || (section.list && !section.paragraphs?.length)
  );
  const showParagraphs = (section.paragraphs?.length ?? 0) > 0 || !isSpecial;
  const KindIcon = BLOCK_ICON[blockTypeOf(section)];

  return (
    <div className="group mb-4 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 p-4 hover:border-accent/50 transition-colors">
      {/* Block header / controls */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          <KindIcon className="h-3 w-3" />
          {blockKindLabel(section)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => props.onMove(si, -1)}
            disabled={si === 0}
            aria-label="Move block up"
            className="rounded p-1 text-neutral-400 hover:text-accent disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => props.onMove(si, 1)}
            disabled={si === total - 1}
            aria-label="Move block down"
            className="rounded p-1 text-neutral-400 hover:text-accent disabled:opacity-30"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            onClick={() => props.onDuplicate(si)}
            aria-label="Duplicate block"
            title="Duplicate block"
            className="rounded p-1 text-neutral-400 hover:text-accent"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={() => props.onDelete(si)}
            aria-label="Delete block"
            className="rounded p-1 text-neutral-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Optional heading (hidden for divider) */}
      {!section.divider && (
        <input
          type="text"
          value={section.title}
          onChange={(e) => props.onPatch(si, { title: e.target.value })}
          placeholder="Optional heading"
          aria-label="Block heading"
          className="w-full text-lg font-bold text-neutral-900 dark:text-white bg-transparent border-none outline-none focus:ring-0 mb-2"
        />
      )}

      {/* Paragraphs */}
      {showParagraphs && (
        <div className="space-y-1.5">
          {(section.paragraphs ?? []).map((para, pi) => (
            <div key={pi} className="flex items-start gap-1.5">
              <textarea
                value={para}
                onChange={(e) => props.onUpdateParagraph(si, pi, e.target.value)}
                rows={Math.max(2, Math.ceil((para.length || 1) / 80))}
                aria-label={`Paragraph ${pi + 1}`}
                className={`${fieldCls} leading-relaxed`}
              />
              <button
                onClick={() => props.onRemoveParagraph(si, pi)}
                aria-label="Remove paragraph"
                className="mt-1 shrink-0 rounded p-1 text-neutral-300 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => props.onAddParagraph(si)}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent"
          >
            <Plus className="h-3 w-3" /> Add paragraph
          </button>
        </div>
      )}

      {/* List */}
      {section.list && (
        <div className="mt-2 space-y-1.5">
          {section.list.map((item, ii) => (
            <div key={ii} className="flex items-center gap-1.5">
              {section.ordered ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">{ii + 1}</span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              )}
              <input
                type="text"
                value={item}
                onChange={(e) => props.onUpdateListItem(si, ii, e.target.value)}
                aria-label={`List item ${ii + 1}`}
                className={fieldCls}
              />
              <button
                onClick={() => props.onRemoveListItem(si, ii)}
                aria-label="Remove list item"
                className="shrink-0 rounded p-1 text-neutral-300 hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => props.onAddListItem(si)}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent"
          >
            <Plus className="h-3 w-3" /> Add item
          </button>
        </div>
      )}

      {/* Image */}
      {section.image && (
        <div className="mt-2 space-y-2">
          <input
            type="url"
            value={section.image.url}
            onChange={(e) => props.onPatch(si, { image: { url: e.target.value, alt: section.image?.alt ?? "" } })}
            placeholder="Image URL (https://…)"
            aria-label="Image URL"
            className={fieldCls}
          />
          <div>
            <input
              type="text"
              value={section.image.alt}
              onChange={(e) => props.onPatch(si, { image: { url: section.image?.url ?? "", alt: e.target.value } })}
              placeholder="Alt text — describe the image"
              aria-label="Image alt text"
              className={fieldCls}
            />
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Alt text is read aloud to blind users. Describe what the image shows (leave blank only if purely decorative).
            </p>
          </div>
        </div>
      )}

      {/* Quote */}
      {section.quote && (
        <div className="mt-2 space-y-2">
          <textarea
            value={section.quote.text}
            onChange={(e) => props.onPatch(si, { quote: { text: e.target.value, attribution: section.quote?.attribution } })}
            rows={2}
            placeholder="Quotation text"
            aria-label="Quote text"
            className={fieldCls}
          />
          <input
            type="text"
            value={section.quote.attribution ?? ""}
            onChange={(e) => props.onPatch(si, { quote: { text: section.quote?.text ?? "", attribution: e.target.value } })}
            placeholder="Attribution (optional) — who said it"
            aria-label="Quote attribution"
            className={fieldCls}
          />
        </div>
      )}

      {/* Callout */}
      {section.callout && (
        <div className="mt-2 space-y-2 rounded-md border border-accent/20 bg-accent/5 p-2.5">
          {/* Tone picker */}
          <div className="flex flex-wrap gap-1.5">
            {CALLOUT_VARIANTS.map((v) => {
              const active = (section.callout?.variant ?? "note") === v.value;
              const VIcon = v.Icon;
              return (
                <button
                  key={v.value}
                  type="button"
                  onClick={() =>
                    props.onPatch(si, { callout: { title: section.callout?.title ?? "", body: section.callout?.body ?? "", variant: v.value } })
                  }
                  aria-pressed={active}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-accent/50"
                  }`}
                >
                  <VIcon className="h-3 w-3" /> {v.label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={section.callout.title}
            onChange={(e) => props.onPatch(si, { callout: { title: e.target.value, body: section.callout?.body ?? "", variant: section.callout?.variant } })}
            placeholder="Callout title"
            aria-label="Callout title"
            className={`${fieldCls} font-semibold`}
          />
          <textarea
            value={section.callout.body}
            onChange={(e) => props.onPatch(si, { callout: { title: section.callout?.title ?? "", body: e.target.value, variant: section.callout?.variant } })}
            rows={2}
            placeholder="Callout body"
            aria-label="Callout body"
            className={fieldCls}
          />
        </div>
      )}

      {/* Code */}
      {section.code !== undefined && (
        <textarea
          value={section.code}
          onChange={(e) => props.onPatch(si, { code: e.target.value })}
          rows={Math.max(3, Math.min(20, (section.code.match(/\n/g)?.length ?? 0) + 2))}
          placeholder="Code snippet"
          aria-label="Code"
          spellCheck={false}
          className="mt-2 w-full rounded-md bg-neutral-900 text-neutral-100 font-mono text-xs leading-relaxed outline-none resize-none px-3 py-2"
        />
      )}

      {/* Button */}
      {section.button && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={section.button.label}
            onChange={(e) => props.onPatch(si, { button: { label: e.target.value, url: section.button?.url ?? "" } })}
            placeholder="Button label"
            aria-label="Button label"
            className={fieldCls}
          />
          <input
            type="url"
            value={section.button.url}
            onChange={(e) => props.onPatch(si, { button: { label: section.button?.label ?? "", url: e.target.value } })}
            placeholder="Button link (https://…)"
            aria-label="Button URL"
            className={fieldCls}
          />
        </div>
      )}

      {/* Divider */}
      {section.divider && (
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-300 dark:bg-neutral-600" />
          Divider
          <span className="h-px flex-1 bg-neutral-300 dark:bg-neutral-600" />
        </div>
      )}

      {/* Stats — value + label editable; styling preserved */}
      {section.stats && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {section.stats.map((stat, sti) => (
              <div key={sti} className="relative rounded-md border border-neutral-200 dark:border-neutral-700 p-2">
                {(section.stats?.length ?? 0) > 1 && (
                  <button
                    onClick={() => props.onPatch(si, { stats: section.stats?.filter((_, j) => j !== sti) })}
                    aria-label={`Remove stat ${sti + 1}`}
                    className="absolute right-1 top-1 rounded p-0.5 text-neutral-300 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                <input
                  type="text"
                  value={stat.value}
                  onChange={(e) =>
                    props.onPatch(si, { stats: section.stats?.map((s, j) => (j === sti ? { ...s, value: e.target.value } : s)) })
                  }
                  aria-label={`Stat ${sti + 1} value`}
                  className="w-full bg-transparent text-center text-lg font-bold text-neutral-900 dark:text-white outline-none"
                />
                <input
                  type="text"
                  value={stat.label}
                  onChange={(e) =>
                    props.onPatch(si, { stats: section.stats?.map((s, j) => (j === sti ? { ...s, label: e.target.value } : s)) })
                  }
                  aria-label={`Stat ${sti + 1} label`}
                  className="w-full bg-transparent text-center text-[10px] uppercase text-neutral-500 outline-none"
                />
              </div>
            ))}
          </div>
          {(section.stats?.length ?? 0) < 6 && (
            <button
              onClick={() =>
                props.onPatch(si, {
                  stats: [
                    ...(section.stats ?? []),
                    { value: "0", label: "Metric", color: "text-accent", labelColor: "text-neutral-600 dark:text-neutral-300", bg: "bg-neutral-50 dark:bg-neutral-900", border: "border-neutral-200 dark:border-neutral-700" },
                  ],
                })
              }
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent"
            >
              <Plus className="h-3 w-3" /> Add stat
            </button>
          )}
        </div>
      )}

      {/* Video */}
      {section.video && (
        <div className="mt-2 space-y-2">
          <input
            type="url"
            value={section.video.url}
            onChange={(e) => props.onPatch(si, { video: { url: e.target.value, title: section.video?.title ?? "" } })}
            placeholder="YouTube or Vimeo URL (e.g. https://youtu.be/…)"
            aria-label="Video URL"
            className={fieldCls}
          />
          <input
            type="text"
            value={section.video.title ?? ""}
            onChange={(e) => props.onPatch(si, { video: { url: section.video?.url ?? "", title: e.target.value } })}
            placeholder="Caption (optional)"
            aria-label="Video caption"
            className={fieldCls}
          />
          {section.video.url && !safeVideoEmbed(section.video.url) ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Only YouTube and Vimeo links are supported. Paste the share or watch URL.
            </p>
          ) : section.video.url ? (
            <div className="relative w-full overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700" style={{ aspectRatio: "16 / 9" }}>
              <iframe src={safeVideoEmbed(section.video.url)} title={section.video.title || "Video preview"} className="absolute inset-0 h-full w-full" allowFullScreen />
            </div>
          ) : null}
        </div>
      )}

      {/* Table */}
      {section.table && (
        <TableEditor
          table={section.table}
          onChange={(table) => props.onPatch(si, { table })}
        />
      )}

      {/* Accordion / FAQ */}
      {section.accordion && (
        <div className="mt-2 space-y-2">
          {section.accordion.map((item, ai) => (
            <div key={ai} className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
                <input
                  type="text"
                  value={item.q}
                  onChange={(e) => props.onPatch(si, { accordion: section.accordion?.map((it, j) => (j === ai ? { ...it, q: e.target.value } : it)) })}
                  placeholder="Question"
                  aria-label={`FAQ question ${ai + 1}`}
                  className={`${fieldCls} font-medium`}
                />
                <button
                  onClick={() => props.onPatch(si, { accordion: section.accordion?.filter((_, j) => j !== ai) })}
                  aria-label={`Remove FAQ item ${ai + 1}`}
                  className="shrink-0 rounded p-1 text-neutral-300 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={item.a}
                onChange={(e) => props.onPatch(si, { accordion: section.accordion?.map((it, j) => (j === ai ? { ...it, a: e.target.value } : it)) })}
                rows={2}
                placeholder="Answer"
                aria-label={`FAQ answer ${ai + 1}`}
                className={fieldCls}
              />
            </div>
          ))}
          <button
            onClick={() => props.onPatch(si, { accordion: [...(section.accordion ?? []), { q: "", a: "" }] })}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent"
          >
            <Plus className="h-3 w-3" /> Add question
          </button>
        </div>
      )}
    </div>
  );
}

// ── Table editor (headers + cells + add/remove row & column) ────────────────────

interface TableData {
  headers: string[];
  rows: string[][];
}

function TableEditor({ table, onChange }: { table: TableData; onChange: (t: TableData) => void }) {
  const cols = table.headers.length;

  function setHeader(ci: number, value: string) {
    onChange({ ...table, headers: table.headers.map((h, j) => (j === ci ? value : h)) });
  }
  function setCell(ri: number, ci: number, value: string) {
    onChange({
      ...table,
      rows: table.rows.map((row, j) => {
        if (j !== ri) return row;
        const next = [...row];
        while (next.length < cols) next.push("");
        next[ci] = value;
        return next;
      }),
    });
  }
  function addColumn() {
    onChange({ headers: [...table.headers, `Column ${cols + 1}`], rows: table.rows.map((r) => [...r, ""]) });
  }
  function removeColumn(ci: number) {
    if (cols <= 1) return;
    onChange({ headers: table.headers.filter((_, j) => j !== ci), rows: table.rows.map((r) => r.filter((_, j) => j !== ci)) });
  }
  function addRow() {
    onChange({ ...table, rows: [...table.rows, Array.from({ length: cols }, () => "")] });
  }
  function removeRow(ri: number) {
    onChange({ ...table, rows: table.rows.filter((_, j) => j !== ri) });
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {table.headers.map((h, ci) => (
                <th key={ci} className="border-b border-r border-neutral-200 dark:border-neutral-700 p-1 last:border-r-0">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={h}
                      onChange={(e) => setHeader(ci, e.target.value)}
                      aria-label={`Column ${ci + 1} header`}
                      className="w-full min-w-24 bg-transparent px-1 py-0.5 font-semibold text-neutral-800 dark:text-neutral-200 outline-none"
                    />
                    {cols > 1 && (
                      <button onClick={() => removeColumn(ci)} aria-label={`Remove column ${ci + 1}`} className="shrink-0 rounded p-0.5 text-neutral-300 hover:text-red-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri}>
                {table.headers.map((_, ci) => (
                  <td key={ci} className="border-b border-r border-neutral-100 dark:border-neutral-800 p-1 last:border-r-0">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={row[ci] ?? ""}
                        onChange={(e) => setCell(ri, ci, e.target.value)}
                        aria-label={`Row ${ri + 1} column ${ci + 1}`}
                        className="w-full min-w-24 bg-transparent px-1 py-0.5 text-neutral-700 dark:text-neutral-300 outline-none"
                      />
                      {ci === 0 && table.rows.length > 1 && (
                        <button onClick={() => removeRow(ri)} aria-label={`Remove row ${ri + 1}`} className="shrink-0 rounded p-0.5 text-neutral-300 hover:text-red-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={addRow} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent">
          <Plus className="h-3 w-3" /> Add row
        </button>
        <button onClick={addColumn} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-accent">
          <Plus className="h-3 w-3" /> Add column
        </button>
      </div>
    </div>
  );
}
