"use client";

/**
 * RegLayer — Article Editor (Admin CMS)
 *
 * WHY: Content needs to stay fresh without deploying code.
 * Admins edit directly in the UI — no CMS login, no context switch.
 *
 * WHAT:
 * - Floating "Edit" button for admin/master admin users
 * - Toggle into edit mode: all text becomes editable
 * - AI assist: describe what to change, AI suggests edits
 * - Version safety: every save snapshots the previous state
 * - Section-level editing: can't accidentally wipe unrelated content
 *
 * HOW:
 * - contentEditable + controlled state for manual editing
 * - POST /api/blog/[slug]/ai-edit for AI suggestions
 * - PATCH /api/blog/[slug] to save (always creates version first)
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Pencil, X, Save, Sparkles, RotateCcw, Check, AlertTriangle,
  Loader2, History,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface Section {
  id: string;
  title: string;
  paragraphs: string[];
  code?: string;
  list?: string[];
  callout?: { title: string; body: string };
}

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
  const { t } = useI18n();
  const { data: session } = useSession();
  const [editing, setEditing] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ sections: Section[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [changeNote, setChangeNote] = useState("");

  // Editable content state — starts as copy of current article
  const [editTitle, setEditTitle] = useState(article.title);
  const [editExcerpt, setEditExcerpt] = useState(article.excerpt);
  const [editSections, setEditSections] = useState<Section[]>(
    (article.content?.sections ?? []) as Section[]
  );

  const isAdmin = session?.user?.isMasterAdmin || session?.user?.role === "admin" || session?.user?.role === "owner";
  if (!isAdmin) return null;

  function startEditing() {
    setEditing(true);
    onEditingChange?.(true);
    setEditTitle(article.title);
    setEditExcerpt(article.excerpt);
    setEditSections((article.content?.sections ?? []) as Section[]);
    setError(null);
  }

  function cancelEditing() {
    setEditing(false);
    onEditingChange?.(false);
    setAiMode(false);
    setAiSuggestion(null);
    setError(null);
  }

  async function saveChanges() {
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
        const data = await res.json();
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
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/blog/${article.slug}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: aiInstruction }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "AI edit failed");
      }
      const { suggestion } = await res.json();
      setAiSuggestion(suggestion);
      setEditSections(suggestion.sections);
      setAiMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI edit failed");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiSuggestion() {
    if (aiSuggestion) {
      setEditSections(aiSuggestion.sections);
      setChangeNote(`AI edit: ${aiInstruction}`);
    }
  }

  function rejectAiSuggestion() {
    setAiSuggestion(null);
    setEditSections((article.content?.sections ?? []) as Section[]);
  }

  function updateSectionParagraph(sectionIdx: number, paraIdx: number, value: string) {
    const updated = [...editSections];
    updated[sectionIdx] = {
      ...updated[sectionIdx],
      paragraphs: updated[sectionIdx].paragraphs.map((p, i) => i === paraIdx ? value : p),
    };
    setEditSections(updated);
  }

  function updateSectionTitle(sectionIdx: number, value: string) {
    const updated = [...editSections];
    updated[sectionIdx] = { ...updated[sectionIdx], title: value };
    setEditSections(updated);
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
              onClick={() => setShowVersions(!showVersions)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <History className="h-3 w-3" /> Versions
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
          <div className="mx-auto max-w-4xl px-6 pb-2">
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" /> {error}
            </div>
          </div>
        )}

        {/* AI instruction panel */}
        {aiMode && (
          <div className="mx-auto max-w-4xl px-6 pb-3">
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
          <div className="mx-auto max-w-4xl px-6 pb-3">
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 px-3 py-2">
              <span className="text-xs text-emerald-700 dark:text-emerald-400">AI suggested changes ready for review</span>
              <div className="flex items-center gap-2">
                <button onClick={rejectAiSuggestion} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700">
                  <RotateCcw className="h-3 w-3" /> Revert
                </button>
                <button onClick={applyAiSuggestion} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700">
                  <Check className="h-3 w-3" /> Keep
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change note */}
        <div className="mx-auto max-w-4xl px-6 pb-2">
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
      <div className="mx-auto max-w-4xl px-6">
        {/* Title */}
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white bg-transparent border-b-2 border-dashed border-accent/30 focus:border-accent outline-none pb-2 mb-4"
        />

        {/* Excerpt */}
        <textarea
          value={editExcerpt}
          onChange={(e) => setEditExcerpt(e.target.value)}
          rows={2}
          className="w-full text-base text-neutral-600 dark:text-neutral-300 bg-transparent border-b border-dashed border-neutral-300 dark:border-neutral-700 focus:border-accent outline-none resize-none pb-2 mb-8"
        />

        {/* Sections */}
        {editSections.map((section, si) => (
          <div key={section.id || si} className="mb-8 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 p-4 hover:border-accent/50 transition-colors">
            <input
              type="text"
              value={section.title}
              onChange={(e) => updateSectionTitle(si, e.target.value)}
              className="w-full text-lg font-bold text-neutral-900 dark:text-white bg-transparent border-none outline-none focus:ring-0 mb-3"
            />
            {section.paragraphs.map((para, pi) => (
              <textarea
                key={pi}
                value={para}
                onChange={(e) => updateSectionParagraph(si, pi, e.target.value)}
                rows={Math.max(2, Math.ceil(para.length / 80))}
                className="w-full text-sm text-neutral-700 dark:text-neutral-300 bg-transparent border-none outline-none resize-none mb-2 leading-relaxed focus:bg-accent/5 rounded px-2 py-1"
              />
            ))}
            {section.code && (
              <div className="mt-2 rounded bg-neutral-100 dark:bg-neutral-800 p-2">
                <code className="text-[10px] text-neutral-500">Code block (edit via AI)</code>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
