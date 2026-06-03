"use client";

/**
 * RegLayer — Personalized Learning Paths Page
 *
 * WHY: Turns violation data into actionable curriculum. Developers learn
 *      exactly what they need based on their weaknesses.
 *
 * WHAT: Ordered learning paths by priority, expandable lessons with
 *       theory, code examples, and self-test questions.
 *
 * HOW: Fetches /api/learn, renders personalized paths with expandable lesson cards.
 */

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Target,
  CheckCircle2,
  AlertTriangle,
  Award,
  ArrowRight,
  Lightbulb,
  Code2,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { SKILL_CATEGORIES } from "@/lib/skills/engine";
import type { PersonalizedPath, Lesson, LearningModule } from "@/lib/skills/learning-paths";

const CATEGORY_ICONS: Record<string, string> = {
  color: "🎨",
  structure: "🏗️",
  forms: "📝",
  images: "🖼️",
  keyboard: "⌨️",
  aria: "♿",
};

export default function LearnPage() {
  const [paths, setPaths] = useState<PersonalizedPath[]>([]);
  const [allModules, setAllModules] = useState<LearningModule[]>([]);
  const [weakestCategory, setWeakestCategory] = useState<string | null>(null);
  const [overallScore, setOverallScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<"bad" | "good">("bad");

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch("/api/learn");
        if (!resp.ok) throw new Error("Failed to load learning paths");
        const data = await resp.json();
        setPaths(data.paths);
        setAllModules(data.allModules);
        setWeakestCategory(data.weakestCategory);
        setOverallScore(data.overallScore);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-3 border-neutral-200 dark:border-neutral-700 border-t-indigo-500" />
            <BookOpen className="h-5 w-5 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-sm text-neutral-500 animate-pulse">Building your learning paths...</p>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center max-w-md">
            <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
              <BookOpen className="h-10 w-10 text-neutral-300" />
            </div>
            <p className="text-sm text-neutral-500">{error}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // Use personalized paths if available, else show all modules
  const displayPaths = paths.length > 0 ? paths : allModules.map((m, i) => ({
    category: m.category,
    module: m,
    priority: i + 1,
    reason: "Explore this topic to improve your accessibility skills",
    categoryScore: 50,
  }));

  const totalLessons = displayPaths.reduce((acc, p) => acc + p.module.lessons.length, 0);
  const totalMinutes = displayPaths.reduce(
    (acc, p) => acc + p.module.lessons.reduce((a, l) => a + l.estimatedMinutes, 0), 0
  );

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200/60 dark:border-neutral-700/60 bg-gradient-to-br from-white via-emerald-50/20 to-teal-50/30 dark:from-neutral-900 dark:via-emerald-950/10 dark:to-teal-950/10 p-6 sm:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald-100/30 to-transparent dark:from-emerald-900/10 rounded-full -translate-y-1/2 translate-x-1/3" />
          
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Learning Paths</h1>
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Personalized curriculum built from your scan results
              </p>
              <div className="flex items-center gap-4 mt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <BookOpen className="h-3.5 w-3.5" />
                  {totalLessons} lessons
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <Clock className="h-3.5 w-3.5" />
                  ~{totalMinutes} min total
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                  <Target className="h-3.5 w-3.5" />
                  {displayPaths.length} paths
                </span>
              </div>
            </div>
            <Link
              href="/skills"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors shrink-0"
            >
              <Award className="h-4 w-4" />
              Skill Score
            </Link>
          </div>
        </div>

        {/* Focus Area Banner */}
        {weakestCategory && (
          <div className="flex items-center gap-4 p-4 rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/10">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-xl shrink-0">
              {CATEGORY_ICONS[weakestCategory] || "📚"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Priority: {SKILL_CATEGORIES[weakestCategory as keyof typeof SKILL_CATEGORIES]?.name}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Your biggest growth opportunity &middot; Score: <strong>{overallScore}/100</strong>
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-amber-400 shrink-0" />
          </div>
        )}

        {/* Learning Paths */}
        <div className="space-y-5">
          {displayPaths.map((path) => {
            const pathMinutes = path.module.lessons.reduce((a, l) => a + l.estimatedMinutes, 0);
            const emoji = CATEGORY_ICONS[path.category] || "📋";

            return (
              <div
                key={path.category}
                className="rounded-2xl border border-neutral-200/80 dark:border-neutral-700/80 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Path Header */}
                <div className="p-5 pb-4 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-start gap-4">
                    <div className={`flex items-center justify-center w-11 h-11 rounded-xl text-xl shrink-0 ${
                      path.priority === 1 ? "bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/20" :
                      path.priority === 2 ? "bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/20" :
                      "bg-gradient-to-br from-neutral-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-800/50"
                    }`}>
                      {emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          path.priority === 1 ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" :
                          path.priority === 2 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                          "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                        }`}>
                          #{path.priority}
                        </span>
                        <h3 className="text-base font-semibold text-neutral-900 dark:text-white truncate">
                          {path.module.title}
                        </h3>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{path.module.description}</p>
                      <div className="flex items-center gap-3 mt-2.5">
                        <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          {path.module.lessons.length} lessons
                        </span>
                        <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {pathMinutes} min
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <ScoreBadge score={path.categoryScore} />
                      {/* Mini progress bar */}
                      <div className="w-16 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                          style={{ width: `${path.categoryScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Reason tag */}
                  <div className="mt-3 ml-15">
                    <p className="text-[11px] text-neutral-400 italic pl-15">{path.reason}</p>
                  </div>
                </div>

                {/* Lessons List */}
                <div className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                  {path.module.lessons.map((lesson, idx) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      index={idx + 1}
                      expanded={expandedLesson === lesson.id}
                      codeTab={codeTab}
                      onCodeTabChange={setCodeTab}
                      onToggle={() => setExpandedLesson(
                        expandedLesson === lesson.id ? null : lesson.id
                      )}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────── Sub Components ───────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? "text-emerald-700 dark:text-emerald-300" :
    score >= 70 ? "text-amber-700 dark:text-amber-300" :
    score >= 50 ? "text-orange-700 dark:text-orange-300" :
    "text-red-700 dark:text-red-300";

  return (
    <span className={`text-sm font-black ${color}`}>
      {score}<span className="text-[10px] font-normal text-neutral-400">/100</span>
    </span>
  );
}

function LessonCard({ lesson, index, expanded, codeTab, onCodeTabChange, onToggle }: {
  lesson: Lesson;
  index: number;
  expanded: boolean;
  codeTab: "bad" | "good";
  onCodeTabChange: (tab: "bad" | "good") => void;
  onToggle: () => void;
}) {
  const diffColor =
    lesson.difficulty === "beginner" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40" :
    lesson.difficulty === "intermediate" ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40" :
    "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800/40";

  return (
    <div className={`transition-colors ${expanded ? "bg-neutral-50/50 dark:bg-neutral-800/10" : ""}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors text-left group"
      >
        {/* Lesson number */}
        <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 transition-colors ${
          expanded
            ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
        }`}>
          {index}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
            {lesson.title}
          </p>
          <p className="text-xs text-neutral-400 mt-0.5 truncate">{lesson.description}</p>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${diffColor}`}>
            {lesson.difficulty}
          </span>
          <span className="text-[11px] text-neutral-400 flex items-center gap-0.5 w-10 justify-end">
            <Clock className="h-3 w-3" />
            {lesson.estimatedMinutes}m
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 transition-colors shrink-0" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-1 ml-9 space-y-5">
          {/* Theory */}
          <div className="rounded-xl border border-neutral-200/70 dark:border-neutral-700/70 bg-white dark:bg-neutral-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                Key Concept
              </h4>
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-line leading-relaxed">
              {lesson.content.theory}
            </div>
            {/* WCAG Tags */}
            <div className="flex items-center gap-2 flex-wrap mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <span className="text-[10px] font-medium text-neutral-400">WCAG:</span>
              {lesson.wcagCriteria.map((c) => (
                <span
                  key={c}
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/40"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Code Examples — Tabbed */}
          <div className="rounded-xl border border-neutral-200/70 dark:border-neutral-700/70 overflow-hidden">
            {/* Tab Header */}
            <div className="flex border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
              <button
                onClick={() => onCodeTabChange("bad")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                  codeTab === "bad"
                    ? "text-red-600 dark:text-red-400 bg-white dark:bg-neutral-900 border-b-2 border-red-500 -mb-[1px]"
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Don&apos;t Do This
              </button>
              <button
                onClick={() => onCodeTabChange("good")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                  codeTab === "good"
                    ? "text-emerald-600 dark:text-emerald-400 bg-white dark:bg-neutral-900 border-b-2 border-emerald-500 -mb-[1px]"
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Do This Instead
              </button>
            </div>
            {/* Code Content */}
            <div className="bg-white dark:bg-neutral-900">
              {codeTab === "bad" ? (
                <div className="p-4">
                  <pre className="text-xs bg-red-50/50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 rounded-lg p-3 overflow-x-auto font-mono leading-relaxed">
                    <code>{lesson.content.badExample.code}</code>
                  </pre>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    {lesson.content.badExample.explanation}
                  </p>
                </div>
              ) : (
                <div className="p-4">
                  <pre className="text-xs bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 rounded-lg p-3 overflow-x-auto font-mono leading-relaxed">
                    <code>{lesson.content.goodExample.code}</code>
                  </pre>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                    {lesson.content.goodExample.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {lesson.content.tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-100 dark:border-neutral-800 p-2.5"
              >
                <Code2 className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" />
                <span className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{tip}</span>
              </div>
            ))}
          </div>

          {/* Self-Test */}
          <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/10 border border-indigo-200/60 dark:border-indigo-800/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 shrink-0">
                <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">Test Yourself</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1 leading-relaxed">
                  {lesson.content.testYourself}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
