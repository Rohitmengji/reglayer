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
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Target,
  CheckCircle2,
  AlertTriangle,
  Award,
} from "lucide-react";
import Link from "next/link";
import { SKILL_CATEGORIES } from "@/lib/skills/engine";
import type { PersonalizedPath, Lesson, LearningModule } from "@/lib/skills/learning-paths";

export default function LearnPage() {
  const [paths, setPaths] = useState<PersonalizedPath[]>([]);
  const [allModules, setAllModules] = useState<LearningModule[]>([]);
  const [weakestCategory, setWeakestCategory] = useState<string | null>(null);
  const [overallScore, setOverallScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

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
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <BookOpen className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-600 dark:text-neutral-300 font-medium">{error}</p>
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

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Learning Paths</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Personalized curriculum based on your scan results
            </p>
          </div>
          <Link
            href="/skills"
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <Award className="h-4 w-4" />
            View Skill Score
          </Link>
        </div>

        {/* Progress Banner */}
        {weakestCategory && (
          <Card className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Focus Area: {SKILL_CATEGORIES[weakestCategory as keyof typeof SKILL_CATEGORIES]?.name}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Based on your scan results, this is where you&apos;ll see the biggest improvement.
                    Your current overall skill score is <strong>{overallScore}/100</strong>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Learning Paths */}
        <div className="space-y-4">
          {displayPaths.map((path) => (
            <Card
              key={path.category}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                      path.priority === 1 ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" :
                      path.priority === 2 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" :
                      "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                    }`}>
                      {path.priority}
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-neutral-900 dark:text-white">
                        {path.module.title}
                      </CardTitle>
                      <p className="text-xs text-neutral-500 mt-0.5">{path.module.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={path.categoryScore} />
                  </div>
                </div>
                <p className="text-xs text-neutral-400 mt-2 pl-11">{path.reason}</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="pl-11 space-y-2">
                  {path.module.lessons.map((lesson) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      expanded={expandedLesson === lesson.id}
                      onToggle={() => setExpandedLesson(
                        expandedLesson === lesson.id ? null : lesson.id
                      )}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────── Sub Components ───────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" :
    score >= 70 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" :
    score >= 50 ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" :
    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300";

  return (
    <span className={`text-xs font-bold px-2 py-1 rounded-md ${color}`}>
      {score}/100
    </span>
  );
}

function LessonCard({ lesson, expanded, onToggle }: { lesson: Lesson; expanded: boolean; onToggle: () => void }) {
  const diffColor =
    lesson.difficulty === "beginner" ? "text-green-600 bg-green-50 dark:bg-green-900/20" :
    lesson.difficulty === "intermediate" ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20" :
    "text-purple-600 bg-purple-50 dark:bg-purple-900/20";

  return (
    <div className="rounded-lg border border-neutral-100 dark:border-neutral-800 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {lesson.title}
            </p>
            <p className="text-xs text-neutral-500 mt-0.5">{lesson.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${diffColor}`}>
            {lesson.difficulty}
          </span>
          <span className="text-xs text-neutral-400 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {lesson.estimatedMinutes}m
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 p-4 space-y-4 bg-neutral-50/50 dark:bg-neutral-800/20">
          {/* Theory */}
          <div>
            <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-2">
              Concept
            </h4>
            <div className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-line leading-relaxed">
              {lesson.content.theory}
            </div>
          </div>

          {/* WCAG Criteria */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-neutral-500">WCAG:</span>
            {lesson.wcagCriteria.map((c) => (
              <span
                key={c}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              >
                {c}
              </span>
            ))}
          </div>

          {/* Bad Example */}
          <div>
            <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Don&apos;t Do This
            </h4>
            <pre className="text-xs bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3 overflow-x-auto">
              <code>{lesson.content.badExample.code}</code>
            </pre>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              ↳ {lesson.content.badExample.explanation}
            </p>
          </div>

          {/* Good Example */}
          <div>
            <h4 className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Do This Instead
            </h4>
            <pre className="text-xs bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3 overflow-x-auto">
              <code>{lesson.content.goodExample.code}</code>
            </pre>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ↳ {lesson.content.goodExample.explanation}
            </p>
          </div>

          {/* Tips */}
          <div>
            <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide mb-2">
              Pro Tips
            </h4>
            <ul className="space-y-1">
              {lesson.content.tips.map((tip, i) => (
                <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400 flex items-start gap-2">
                  <span className="text-neutral-400 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Self-Test */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-3">
            <div className="flex items-start gap-2">
              <Target className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">Test Yourself</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
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
