"use client";

/**
 * RegLayer — Developer Skill Score Page
 *
 * WHY: Gamification drives repeat usage. Developers see their growth.
 * WHAT: Skill score ring, category radar, badges shelf, progress stats.
 * HOW: Fetches /api/skills and renders computed profile.
 */

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Trophy,
  Flame,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Award,
  BookOpen,
  Sparkles,
  ArrowRight,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { SkillProfile, CategoryScore, Badge } from "@/lib/skills/engine";
import { SKILL_CATEGORIES } from "@/lib/skills/engine";

const LEVEL_THRESHOLDS = [
  { level: "Novice", min: 0, max: 30 },
  { level: "Beginner", min: 30, max: 50 },
  { level: "Intermediate", min: 50, max: 70 },
  { level: "Advanced", min: 70, max: 85 },
  { level: "Expert", min: 85, max: 100 },
];

const CATEGORY_ICONS: Record<string, string> = {
  color: "🎨",
  structure: "🏗️",
  forms: "📝",
  images: "🖼️",
  keyboard: "⌨️",
  aria: "♿",
};

export default function SkillsPage() {
  const [profile, setProfile] = useState<SkillProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animateScore, setAnimateScore] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch("/api/skills");
        if (!resp.ok) throw new Error("Failed to load skill data");
        const data = await resp.json();
        setProfile(data.profile);
        // Trigger score animation after data loads
        setTimeout(() => setAnimateScore(true), 100);
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
            <Trophy className="h-5 w-5 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-sm text-neutral-500 animate-pulse">Calculating your skill score...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !profile) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center max-w-md">
            <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
              <Trophy className="h-10 w-10 text-neutral-300" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
              No Skill Data Yet
            </h2>
            <p className="text-sm text-neutral-500 mb-6">
              {error || "Run accessibility scans to start building your developer skill profile and earning badges."}
            </p>
            <Link
              href="/scans"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Target className="h-4 w-4" />
              Run Your First Scan
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const scoreColor =
    profile.overallScore >= 85 ? "text-emerald-600 dark:text-emerald-400" :
    profile.overallScore >= 70 ? "text-amber-600 dark:text-amber-400" :
    profile.overallScore >= 50 ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400";

  const ringColor =
    profile.overallScore >= 85 ? "#10b981" :
    profile.overallScore >= 70 ? "#f59e0b" :
    profile.overallScore >= 50 ? "#f97316" : "#ef4444";

  const ringGradientId = "scoreGradient";

  // Calculate level progress
  const currentLevelInfo = LEVEL_THRESHOLDS.find(
    l => profile.overallScore >= l.min && profile.overallScore < l.max
  ) || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const levelProgress = ((profile.overallScore - currentLevelInfo.min) / (currentLevelInfo.max - currentLevelInfo.min)) * 100;
  const nextLevel = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.indexOf(currentLevelInfo) + 1];

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200/60 dark:border-neutral-700/60 bg-gradient-to-br from-white via-indigo-50/30 to-purple-50/40 dark:from-neutral-900 dark:via-indigo-950/20 dark:to-purple-950/20 p-6 sm:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-100/40 to-transparent dark:from-indigo-900/20 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-100/30 to-transparent dark:from-purple-900/10 rounded-full translate-y-1/3 -translate-x-1/4" />
          
          <div className="relative flex flex-col lg:flex-row items-center gap-8">
            {/* Score Ring */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <svg width="180" height="180" viewBox="0 0 180 180" className="drop-shadow-sm">
                  <defs>
                    <linearGradient id={ringGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={ringColor} />
                      <stop offset="100%" stopColor={ringColor} stopOpacity="0.6" />
                    </linearGradient>
                  </defs>
                  <circle cx="90" cy="90" r="74" fill="none" stroke="currentColor" strokeWidth="12" className="text-neutral-100 dark:text-neutral-800" />
                  <circle
                    cx="90" cy="90" r="74"
                    fill="none"
                    stroke={`url(#${ringGradientId})`}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${animateScore ? (profile.overallScore / 100) * 465 : 0} 465`}
                    transform="rotate(-90 90 90)"
                    style={{
                      transition: "stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      filter: `drop-shadow(0 0 12px ${ringColor}50)`,
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-5xl font-black tracking-tight ${scoreColor}`}>
                    {profile.overallScore}
                  </span>
                  <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mt-1 uppercase tracking-wider">
                    {profile.level}
                  </span>
                </div>
              </div>
              {/* Level Progress */}
              {nextLevel && (
                <div className="mt-4 w-full max-w-[180px]">
                  <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                    <span>{currentLevelInfo.level}</span>
                    <span>{nextLevel.level}</span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000"
                      style={{ width: `${animateScore ? levelProgress : 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1 text-center">
                    {currentLevelInfo.max - profile.overallScore} points to {nextLevel.level}
                  </p>
                </div>
              )}
            </div>

            {/* Stats + CTA */}
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-5 w-5 text-indigo-500" />
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Developer Skills</h1>
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                Your accessibility expertise, tracked and gamified
              </p>

              {/* Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Scans"
                  value={String(profile.totalScans)}
                  icon={<Target className="h-4 w-4" />}
                  accent="blue"
                />
                <StatCard
                  label="Fixed"
                  value={String(profile.totalViolationsFixed)}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  accent="green"
                  sub={`${profile.fixRate}%`}
                />
                <StatCard
                  label="Best"
                  value={profile.bestScore.toFixed(0)}
                  icon={<Trophy className="h-4 w-4" />}
                  accent="amber"
                />
                <StatCard
                  label="Streak"
                  value={`${profile.improvementStreak}`}
                  icon={<Flame className="h-4 w-4" />}
                  accent="orange"
                />
              </div>

              {/* CTA */}
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/learn"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-all hover:shadow-lg hover:shadow-indigo-200 dark:hover:shadow-indigo-900/30"
                >
                  <BookOpen className="h-4 w-4" />
                  Start Learning
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/scans"
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors"
                >
                  <Zap className="h-4 w-4" />
                  New Scan
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown — Visual Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Category Mastery</h2>
            <span className="text-xs text-neutral-400">
              {profile.categories.filter(c => c.score >= 85).length}/{profile.categories.length} mastered
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {profile.categories.map((cat) => (
              <CategoryCard key={cat.category} category={cat} />
            ))}
          </div>
        </div>

        {/* Badges */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Badges</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                {profile.badges.length}
              </span>
            </div>
            {profile.nextBadge && (
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Next: <span className="font-medium text-neutral-700 dark:text-neutral-300">{profile.nextBadge.name}</span>
              </div>
            )}
          </div>
          {profile.badges.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {profile.badges.map((badge) => (
                <BadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          ) : (
            <Card className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50">
              <CardContent className="py-10 text-center">
                <Award className="h-12 w-12 text-neutral-200 dark:text-neutral-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-neutral-500">No badges yet</p>
                <p className="text-xs text-neutral-400 mt-1">Keep scanning and fixing to unlock achievements!</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recommendation CTA */}
        {profile.weakestCategory && (
          <Link href="/learn" className="block group">
            <div className="relative overflow-hidden rounded-2xl border border-indigo-200 dark:border-indigo-800/50 bg-gradient-to-r from-indigo-50 via-purple-50/50 to-indigo-50 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-indigo-950/30 p-5 transition-all group-hover:shadow-lg group-hover:shadow-indigo-100/50 dark:group-hover:shadow-indigo-900/20 group-hover:border-indigo-300 dark:group-hover:border-indigo-700">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-2xl shrink-0">
                  {CATEGORY_ICONS[profile.weakestCategory] || "📚"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                    Improve {SKILL_CATEGORIES[profile.weakestCategory].name}
                  </p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                    This is your biggest opportunity for growth. Start a personalized learning path.
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-indigo-400 group-hover:translate-x-1 transition-transform shrink-0" />
              </div>
            </div>
          </Link>
        )}
      </div>
    </AppShell>
  );
}

// ─────────────── Sub Components ───────────────

function StatCard({ label, value, icon, accent, sub }: {
  label: string; value: string; icon: React.ReactNode; accent: string; sub?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800/50",
    green: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800/50",
    orange: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800/50",
  };
  const color = colors[accent] || colors.blue;

  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-lg font-bold">{value}</span>
        {sub && <span className="text-[10px] opacity-70 ml-auto">{sub}</span>}
      </div>
      <p className="text-[11px] font-medium opacity-70">{label}</p>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryScore }) {
  const config = SKILL_CATEGORIES[category.category];
  const emoji = CATEGORY_ICONS[category.category] || "📋";

  const barColor =
    category.score >= 85 ? "from-emerald-400 to-emerald-500" :
    category.score >= 70 ? "from-amber-400 to-amber-500" :
    category.score >= 50 ? "from-orange-400 to-orange-500" : "from-red-400 to-red-500";

  const bgTint =
    category.score >= 85 ? "border-emerald-100 dark:border-emerald-900/30" :
    category.score >= 70 ? "border-amber-100 dark:border-amber-900/30" :
    category.score >= 50 ? "border-orange-100 dark:border-orange-900/30" : "border-red-100 dark:border-red-900/30";

  const TrendIcon = category.trend === "improving" ? TrendingUp :
                    category.trend === "declining" ? TrendingDown : Minus;
  const trendColor = category.trend === "improving" ? "text-emerald-500" :
                     category.trend === "declining" ? "text-red-500" : "text-neutral-400";
  const trendLabel = category.trend === "improving" ? "Improving" :
                     category.trend === "declining" ? "Declining" : "Stable";

  return (
    <div className={`rounded-xl border ${bgTint} bg-white dark:bg-neutral-900 p-4 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <div>
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{config.name}</p>
            <div className={`flex items-center gap-1 mt-0.5 ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              <span className="text-[10px] font-medium">{trendLabel}</span>
            </div>
          </div>
        </div>
        <span className="text-lg font-black text-neutral-900 dark:text-white">{category.score}</span>
      </div>
      <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-1000`}
          style={{ width: `${category.score}%` }}
        />
      </div>
      <p className="text-[10px] text-neutral-400 mt-2">
        {category.violationCount} violation{category.violationCount !== 1 ? "s" : ""} found
      </p>
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  const tierStyles = badge.tier === "gold"
    ? "border-amber-300 bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-900/10 shadow-amber-100/50 dark:shadow-amber-900/10"
    : badge.tier === "silver"
    ? "border-neutral-300 bg-gradient-to-b from-neutral-50 to-neutral-100/50 dark:from-neutral-800/50 dark:to-neutral-800/30 shadow-neutral-100/50"
    : "border-orange-200 bg-gradient-to-b from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-900/10 shadow-orange-100/50";

  const emoji = badge.tier === "gold" ? "🏆" : badge.tier === "silver" ? "🥈" : "🥉";

  return (
    <div className={`group relative rounded-xl border ${tierStyles} p-4 text-center shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5`}>
      <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{emoji}</div>
      <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200 leading-tight">
        {badge.name}
      </p>
      <p className="text-[10px] text-neutral-500 mt-1.5 leading-tight">
        {badge.description}
      </p>
      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gradient-to-br from-white to-neutral-100 dark:from-neutral-700 dark:to-neutral-800 border border-neutral-200 dark:border-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
