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

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
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
  Brain,
  Trophy,
  XCircle,
  RotateCcw,
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
      } catch {
        setError("We couldn\u2019t load your learning paths. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <PageLoading message="Building your learning paths..." />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <PageError
          title="Couldn\u2019t load learning paths"
          message={error}
          onRetry={() => window.location.reload()}
          fallbackHref="/dashboard"
        />
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
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200/60 dark:border-neutral-700/60 bg-linear-to-br from-white via-emerald-50/20 to-teal-50/30 dark:from-neutral-900 dark:via-emerald-950/10 dark:to-teal-950/10 p-6 sm:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-linear-to-bl from-emerald-100/30 to-transparent dark:from-emerald-900/10 rounded-full -translate-y-1/2 translate-x-1/3" />
          
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
          <div className="flex items-center gap-4 p-4 rounded-xl border border-amber-200/70 dark:border-amber-800/40 bg-linear-to-r from-amber-50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/10">
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
                      path.priority === 1 ? "bg-linear-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/20" :
                      path.priority === 2 ? "bg-linear-to-br from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/20" :
                      "bg-linear-to-br from-neutral-100 to-neutral-50 dark:from-neutral-800 dark:to-neutral-800/50"
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
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          {path.module.lessons.length} lessons
                        </span>
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
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
                          className="h-full bg-linear-to-r from-emerald-400 to-emerald-500 rounded-full"
                          style={{ width: `${path.categoryScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Reason tag */}
                  <div className="mt-3 ml-15">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 italic pl-15">{path.reason}</p>
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
      {score}<span className="text-[10px] font-normal text-neutral-500 dark:text-neutral-400">/100</span>
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
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
        }`}>
          {index}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
            {lesson.title}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">{lesson.description}</p>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${diffColor}`}>
            {lesson.difficulty}
          </span>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-0.5 w-10 justify-end">
            <Clock className="h-3 w-3" />
            {lesson.estimatedMinutes}m
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
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
              <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">WCAG:</span>
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
                    ? "text-red-600 dark:text-red-400 bg-white dark:bg-neutral-900 border-b-2 border-red-500 -mb-px"
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
                    ? "text-emerald-600 dark:text-emerald-400 bg-white dark:bg-neutral-900 border-b-2 border-emerald-500 -mb-px"
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

          {/* Quiz Section */}
          <LessonQuiz lessonId={lesson.id} />
        </div>
      )}
    </div>
  );
}

// ─────────────── Quiz Component ───────────────

const MAX_ATTEMPTS = 3;

interface QuizQuestion {
  id: string;
  lessonId: string;
  category: string;
  question: string;
  options: string[];
}

interface QuizResultItem {
  questionId: string;
  correct: boolean;
  correctIndex: number;
  explanation: string;
}

interface QuizGradeResult {
  score: number;
  correct: number;
  total: number;
  results: QuizResultItem[];
  passed: boolean;
  skillBoost: number;
}

interface AttemptRecord {
  attempt: number;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
}

function LessonQuiz({ lessonId }: { lessonId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "quiz" | "grading" | "results">("idle");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [gradeResult, setGradeResult] = useState<QuizGradeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [attemptHistory, setAttemptHistory] = useState<AttemptRecord[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);

  const attemptsRemaining = MAX_ATTEMPTS - attempt;
  const bestScore = attemptHistory.length > 0
    ? Math.max(...attemptHistory.map((a) => a.score))
    : null;

  const startQuiz = useCallback(async () => {
    setState("loading");
    setErrorMsg(null);
    setSelectedAnswers({});
    setGradeResult(null);
    setCurrentQuestion(0);
    try {
      const resp = await fetch(`/api/learn/quiz?lessonId=${lessonId}&count=3`);
      if (!resp.ok) throw new Error("Failed to load quiz");
      const data = await resp.json();
      setQuestions(data.questions);
      setState("quiz");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load quiz");
      setState("idle");
    }
  }, [lessonId]);

  const submitQuiz = async () => {
    setState("grading");
    try {
      const answers = questions.map((q) => ({
        questionId: q.id,
        selectedIndex: selectedAnswers[q.id] ?? -1,
      }));
      const resp = await fetch("/api/learn/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, answers }),
      });
      if (!resp.ok) throw new Error("Failed to submit quiz");
      const result: QuizGradeResult = await resp.json();
      setGradeResult(result);
      const newAttempt = attempt + 1;
      setAttempt(newAttempt);
      setAttemptHistory((prev) => [...prev, {
        attempt: newAttempt,
        score: result.score,
        correct: result.correct,
        total: result.total,
        passed: result.passed,
      }]);
      setState("results");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
      setState("quiz");
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => selectedAnswers[q.id] !== undefined);

  // Idle state — show quiz CTA
  if (state === "idle") {
    return (
      <div className="rounded-xl bg-linear-to-r from-violet-50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/10 border border-violet-200/60 dark:border-violet-800/40 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 shrink-0">
              <Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-900 dark:text-violet-200">Test Your Knowledge</p>
              <p className="text-xs text-violet-600/80 dark:text-violet-400/80 mt-0.5">
                3 questions &middot; Multiple choice &middot; {MAX_ATTEMPTS} attempts allowed
              </p>
              {bestScore !== null && (
                <p className="text-[11px] text-violet-500 mt-1 flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  Best score: <strong>{bestScore}%</strong>
                  {attempt < MAX_ATTEMPTS && (
                    <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                      &middot; {attemptsRemaining} {attemptsRemaining === 1 ? "retry" : "retries"} left
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={startQuiz}
              disabled={attempt >= MAX_ATTEMPTS}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-xs font-medium transition-all shadow-sm ${
                attempt >= MAX_ATTEMPTS
                  ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-400 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-700 text-white hover:shadow-md hover:-translate-y-0.5"
              }`}
            >
              {attempt === 0 ? (
                <>
                  <Target className="h-3.5 w-3.5" />
                  Start Quiz
                </>
              ) : attempt >= MAX_ATTEMPTS ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Completed
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry ({attemptsRemaining} left)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Attempt History Mini-Bar */}
        {attemptHistory.length > 0 && (
          <div className="mt-4 pt-3 border-t border-violet-200/40 dark:border-violet-800/30">
            <p className="text-[10px] font-medium text-violet-500 dark:text-violet-400 uppercase tracking-wider mb-2">
              Attempt History
            </p>
            <div className="flex items-center gap-2">
              {attemptHistory.map((a) => (
                <div
                  key={a.attempt}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium border ${
                    a.passed
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300"
                  }`}
                >
                  {a.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  #{a.attempt}: {a.score}%
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: MAX_ATTEMPTS - attemptHistory.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border border-dashed border-neutral-200 dark:border-neutral-700 text-neutral-300 dark:text-neutral-600"
                >
                  #{attemptHistory.length + i + 1}: —
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info chips */}
        {attempt === 0 && (
          <div className="mt-4 pt-3 border-t border-violet-200/40 dark:border-violet-800/30">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md px-2 py-1">
                <Target className="h-3 w-3 text-violet-400" />
                Pass: 70%+ correct
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md px-2 py-1">
                <Award className="h-3 w-3 text-amber-400" />
                Earn up to +5 skill pts
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md px-2 py-1">
                <RotateCcw className="h-3 w-3 text-indigo-400" />
                {MAX_ATTEMPTS} attempts per session
              </span>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {errorMsg}
          </p>
        )}
      </div>
    );
  }

  // Loading state
  if (state === "loading" || state === "grading") {
    return (
      <div className="rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-linear-to-r from-violet-50/50 to-indigo-50/30 dark:from-violet-950/10 dark:to-indigo-950/5 p-8 flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
          <Brain className="h-3.5 w-3.5 text-violet-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
          {state === "loading" ? "Preparing your questions..." : "Analyzing your answers..."}
        </span>
        <span className="text-[11px] text-violet-500/70">
          {state === "loading" ? "Questions are randomized for you" : "Checking against WCAG standards"}
        </span>
      </div>
    );
  }

  // Results state
  if (state === "results" && gradeResult) {
    const scoreColor = gradeResult.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
    const bgColor = gradeResult.passed
      ? "from-emerald-50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/10 border-emerald-200/60 dark:border-emerald-800/40"
      : "from-red-50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/10 border-red-200/60 dark:border-red-800/40";

    const canRetry = attempt < MAX_ATTEMPTS;

    return (
      <div className={`rounded-xl bg-linear-to-r ${bgColor} border overflow-hidden`}>
        {/* Score Header */}
        <div className="p-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {gradeResult.passed ? (
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 ring-4 ring-emerald-50 dark:ring-emerald-900/20">
                  <Trophy className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
              ) : (
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 ring-4 ring-red-50 dark:ring-red-900/20">
                  <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
              )}
              <div>
                <p className={`text-xl font-bold ${scoreColor}`}>
                  {gradeResult.score}%
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {gradeResult.correct}/{gradeResult.total} correct &middot; Attempt {attempt}/{MAX_ATTEMPTS}
                </p>
                {gradeResult.passed && gradeResult.skillBoost > 0 && (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    +{gradeResult.skillBoost} skill points earned!
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              {/* Attempt dots */}
              <div className="flex items-center gap-1">
                {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      i < attempt
                        ? attemptHistory[i]?.passed
                          ? "bg-emerald-400"
                          : "bg-red-400"
                        : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  />
                ))}
              </div>
              {canRetry ? (
                <button
                  onClick={startQuiz}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-750 hover:border-neutral-300 transition-all shadow-sm"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry ({MAX_ATTEMPTS - attempt} left)
                </button>
              ) : (
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">No retries remaining</span>
              )}
            </div>
          </div>

          {/* Motivational message */}
          <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${
            gradeResult.passed
              ? "bg-emerald-100/60 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
              : canRetry
                ? "bg-amber-100/60 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
          }`}>
            {gradeResult.passed
              ? gradeResult.score === 100
                ? "🎉 Perfect score! You've mastered this topic completely."
                : "✅ Great job! You passed. Review the explanations below to solidify your understanding."
              : canRetry
                ? `💡 Not quite — review the explanations below and try again. You have ${MAX_ATTEMPTS - attempt} ${MAX_ATTEMPTS - attempt === 1 ? "attempt" : "attempts"} remaining.`
                : "📖 All attempts used. Review the lesson content above and come back tomorrow for a fresh quiz."}
          </div>
        </div>

        {/* Per-question results */}
        <div className="border-t border-neutral-200/50 dark:border-neutral-800/50 p-5 pt-4 space-y-3">
          <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Question Breakdown
          </p>
          {gradeResult.results.map((result, idx) => {
            const q = questions[idx];
            return (
              <div
                key={result.questionId}
                className={`rounded-lg border p-3.5 transition-all ${
                  result.correct
                    ? "border-emerald-200/70 dark:border-emerald-800/40 bg-white/70 dark:bg-neutral-900/40"
                    : "border-red-200/70 dark:border-red-800/40 bg-white/70 dark:bg-neutral-900/40"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {result.correct ? (
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 shrink-0 mt-0.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 shrink-0 mt-0.5">
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 leading-relaxed">
                      {q?.question}
                    </p>
                    {!result.correct && (
                      <div className="mt-2 rounded-md bg-emerald-50/80 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 px-2.5 py-1.5">
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                          <span className="font-semibold">Correct answer: </span>
                          {q?.options[result.correctIndex]}
                        </p>
                      </div>
                    )}
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed flex items-start gap-1.5">
                      <Lightbulb className="h-3 w-3 mt-0.5 text-amber-400 shrink-0" />
                      {result.explanation}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Best Score Footer */}
        {attemptHistory.length > 1 && (
          <div className="border-t border-neutral-200/50 dark:border-neutral-800/50 px-5 py-3 bg-white/30 dark:bg-neutral-900/30">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-neutral-500">
                Best score across all attempts: <strong className="text-neutral-700 dark:text-neutral-300">{bestScore}%</strong>
              </p>
              <div className="flex items-center gap-1.5">
                {attemptHistory.map((a) => (
                  <span
                    key={a.attempt}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      a.score === bestScore
                        ? "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    #{a.attempt}: {a.score}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Quiz state — show questions
  return (
    <div className="rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
      {/* Quiz Header */}
      <div className="px-4 py-3 bg-linear-to-r from-violet-50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/10 border-b border-violet-200/40 dark:border-violet-800/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <span className="text-xs font-semibold text-violet-900 dark:text-violet-200">
              Knowledge Check
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium">
              Attempt {attempt + 1}/{MAX_ATTEMPTS}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress dots */}
            <div className="flex items-center gap-1">
              {questions.map((q, i) => (
                <div
                  key={q.id}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    selectedAnswers[q.id] !== undefined
                      ? "bg-violet-500"
                      : i === currentQuestion
                        ? "bg-violet-300 dark:bg-violet-600 ring-2 ring-violet-200 dark:ring-violet-800"
                        : "bg-neutral-200 dark:bg-neutral-700"
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-violet-500 font-medium">
              {Object.keys(selectedAnswers).length}/{questions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="p-4 space-y-5">
        {questions.map((q, qIdx) => (
          <div
            key={q.id}
            className={`rounded-lg p-3.5 transition-all ${
              currentQuestion === qIdx
                ? "bg-violet-50/30 dark:bg-violet-950/10 ring-1 ring-violet-100 dark:ring-violet-800/30"
                : ""
            }`}
            onClick={() => setCurrentQuestion(qIdx)}
          >
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 mb-3">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-[10px] font-bold mr-2">
                {qIdx + 1}
              </span>
              {q.question}
            </p>
            <div className="grid gap-2 ml-7">
              {q.options.map((option, oIdx) => {
                const isSelected = selectedAnswers[q.id] === oIdx;
                return (
                  <button
                    key={oIdx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnswers((prev) => ({ ...prev, [q.id]: oIdx }));
                      // Auto-advance to next unanswered
                      if (qIdx < questions.length - 1 && selectedAnswers[questions[qIdx + 1]?.id] === undefined) {
                        setCurrentQuestion(qIdx + 1);
                      }
                    }}
                    className={`w-full text-left rounded-lg border px-3.5 py-2.5 text-xs transition-all ${
                      isSelected
                        ? "border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20 text-violet-800 dark:text-violet-200 ring-1 ring-violet-300 dark:ring-violet-700 shadow-sm"
                        : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 text-neutral-700 dark:text-neutral-300 hover:border-violet-200 dark:hover:border-violet-700 hover:bg-violet-50/30 dark:hover:bg-violet-950/10"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 transition-colors ${
                        isSelected
                          ? "bg-violet-600 text-white"
                          : "bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400"
                      }`}>
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      <span className="leading-relaxed">{option}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Submit Footer */}
      <div className="px-4 pb-4 pt-1">
        {errorMsg && (
          <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {errorMsg}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {allAnswered
              ? "All questions answered — ready to submit"
              : `${questions.length - Object.keys(selectedAnswers).length} questions remaining`}
          </p>
          <button
            onClick={submitQuiz}
            disabled={!allAnswered}
            className={`inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
              allAnswered
                ? "bg-violet-600 hover:bg-violet-700 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed"
            }`}
          >
            {allAnswered ? (
              <>
                <ArrowRight className="h-3.5 w-3.5" />
                Submit Answers
              </>
            ) : (
              "Complete all questions"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
