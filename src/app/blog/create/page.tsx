"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Sparkles, Loader2, Save, FileText,
  Wand2, AlertTriangle,
} from "lucide-react";
import Link from "next/link";

const CATEGORIES = ["WCAG", "EAA", "Legal", "Technical", "Section 508", "Business", "Design"];

export default function CreateArticlePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "manual" | "ai">("choose");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual mode state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState("Technical");
  const [sections, setSections] = useState([
    { id: "intro", title: "Introduction", paragraphs: [""] },
  ]);

  // AI mode state
  const [aiTopic, setAiTopic] = useState("");
  const [aiCategory, setAiCategory] = useState("Technical");
  const [aiTone, setAiTone] = useState("practitioner");
  const [generatedArticle, setGeneratedArticle] = useState<{
    title: string;
    slug: string;
    excerpt: string;
    sections: Array<{ id: string; title: string; paragraphs: string[]; code?: string; list?: string[] }>;
  } | null>(null);

  const isAdmin = session?.user?.isMasterAdmin || session?.user?.role === "admin" || session?.user?.role === "owner";

  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60);
  }

  function addSection() {
    const id = `section-${sections.length + 1}`;
    setSections([...sections, { id, title: "", paragraphs: [""] }]);
  }

  function updateSection(idx: number, field: "title" | "paragraphs", value: string | string[]) {
    const updated = [...sections];
    if (field === "title") {
      updated[idx] = { ...updated[idx], title: value as string };
    } else {
      updated[idx] = { ...updated[idx], paragraphs: value as string[] };
    }
    setSections(updated);
  }

  function removeSection(idx: number) {
    if (sections.length <= 1) return;
    setSections(sections.filter((_, i) => i !== idx));
  }

  async function generateWithAI() {
    if (!aiTopic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: aiTopic,
          category: aiCategory,
          tone: aiTone,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }
      const data = await res.json();
      setGeneratedArticle(data.article);
      setMode("ai");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveArticle() {
    setSaving(true);
    setError(null);

    const articleData = generatedArticle
      ? {
          title: generatedArticle.title,
          slug: generatedArticle.slug,
          excerpt: generatedArticle.excerpt,
          category: aiCategory,
          content: { sections: generatedArticle.sections },
          readTime: `${Math.max(3, Math.ceil(generatedArticle.sections.reduce((acc, s) => acc + s.paragraphs.join(" ").split(" ").length, 0) / 200))} min`,
          status: "PUBLISHED",
        }
      : {
          title,
          slug: slug || generateSlug(title),
          excerpt,
          category,
          content: { sections },
          readTime: `${Math.max(3, Math.ceil(sections.reduce((acc, s) => acc + s.paragraphs.join(" ").split(" ").length, 0) / 200))} min`,
          status: "PUBLISHED",
        };

    if (!articleData.title || !articleData.slug) {
      setError("Title and slug are required");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(articleData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }
      const data = await res.json();
      router.push(`/blog/${data.article.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-neutral-500">You don&apos;t have permission to create articles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/blog" className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Create Article</h1>
          </div>
          {(mode === "manual" || generatedArticle) && (
            <button
              onClick={saveArticle}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Publish
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Mode chooser */}
        {mode === "choose" && !generatedArticle && (
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => setMode("manual")}
              className="group rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 text-left hover:border-accent/50 hover:bg-accent/5 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2">
                  <FileText className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                </div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Write Manually</h2>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Create an article from scratch. Add sections, write paragraphs, include code blocks.
              </p>
            </button>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 text-left hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50/50 dark:hover:bg-violet-950/10 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="rounded-lg bg-violet-100 dark:bg-violet-900/30 p-2">
                  <Wand2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Generate with AI</h2>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-4">
                Describe the topic and let AI draft a full article. Review and edit before publishing.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Topic: e.g., 'WCAG 3.0 Silver timeline and what it means'"
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 outline-none focus:ring-1 focus:ring-violet-500"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-xs text-neutral-700 dark:text-neutral-300 outline-none"
                  >
                    <option value="practitioner">Practitioner tone</option>
                    <option value="executive">Executive summary</option>
                    <option value="tutorial">Tutorial/how-to</option>
                  </select>
                  <button
                    onClick={generateWithAI}
                    disabled={generating || !aiTopic.trim()}
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual editor */}
        {mode === "manual" && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!slug) setSlug(generateSlug(e.target.value));
                  }}
                  placeholder="Article title"
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Slug</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="auto-generated-from-title"
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-mono text-neutral-900 dark:text-white placeholder-neutral-400 outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 outline-none focus:ring-1 focus:ring-accent"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Excerpt</label>
                <input
                  type="text"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Short description (1-2 sentences)"
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Sections</h2>
                <button
                  onClick={addSection}
                  className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add section
                </button>
              </div>
              {sections.map((section, si) => (
                <div key={si} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSection(si, "title", e.target.value)}
                      placeholder="Section title"
                      className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-900 dark:text-white placeholder-neutral-400 outline-none focus:ring-1 focus:ring-accent"
                    />
                    {sections.length > 1 && (
                      <button
                        onClick={() => removeSection(si)}
                        className="text-xs text-red-500 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <textarea
                    value={section.paragraphs[0]}
                    onChange={(e) => updateSection(si, "paragraphs", [e.target.value])}
                    placeholder="Write your content here. Use blank lines to separate paragraphs."
                    rows={4}
                    className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 outline-none resize-y leading-relaxed focus:ring-1 focus:ring-accent"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI generated article preview */}
        {generatedArticle && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/30 px-4 py-3">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <span className="text-sm text-violet-700 dark:text-violet-300">AI-generated article ready for review. Edit anything below before publishing.</span>
            </div>

            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 space-y-4">
              <input
                type="text"
                value={generatedArticle.title}
                onChange={(e) => setGeneratedArticle({ ...generatedArticle, title: e.target.value })}
                className="w-full text-xl font-bold text-neutral-900 dark:text-white bg-transparent border-b border-dashed border-neutral-300 dark:border-neutral-700 outline-none pb-2 focus:border-accent"
              />
              <input
                type="text"
                value={generatedArticle.excerpt}
                onChange={(e) => setGeneratedArticle({ ...generatedArticle, excerpt: e.target.value })}
                className="w-full text-sm text-neutral-600 dark:text-neutral-300 bg-transparent border-b border-dashed border-neutral-300 dark:border-neutral-700 outline-none pb-2 focus:border-accent"
              />
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="font-mono">/{generatedArticle.slug}</span>
                <span>•</span>
                <span>{generatedArticle.sections.length} sections</span>
              </div>
            </div>

            {generatedArticle.sections.map((section, si) => (
              <div key={si} className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-2">
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => {
                    const updated = { ...generatedArticle };
                    updated.sections = [...updated.sections];
                    updated.sections[si] = { ...updated.sections[si], title: e.target.value };
                    setGeneratedArticle(updated);
                  }}
                  className="w-full text-sm font-bold text-neutral-900 dark:text-white bg-transparent outline-none"
                />
                {section.paragraphs.map((para, pi) => (
                  <textarea
                    key={pi}
                    value={para}
                    onChange={(e) => {
                      const updated = { ...generatedArticle };
                      updated.sections = [...updated.sections];
                      updated.sections[si] = {
                        ...updated.sections[si],
                        paragraphs: updated.sections[si].paragraphs.map((p, i) => i === pi ? e.target.value : p),
                      };
                      setGeneratedArticle(updated);
                    }}
                    rows={Math.max(2, Math.ceil(para.length / 90))}
                    className="w-full text-xs text-neutral-700 dark:text-neutral-300 bg-transparent outline-none resize-none leading-relaxed"
                  />
                ))}
                {section.code && (
                  <div className="rounded-md bg-neutral-100 dark:bg-neutral-800 p-3">
                    <pre className="text-[10px] font-mono text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">{section.code}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
  );
}