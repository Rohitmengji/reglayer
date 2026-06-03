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
} from "lucide-react";
import Link from "next/link";
import type { SkillProfile, CategoryScore, Badge } from "@/lib/skills/engine";
import { SKILL_CATEGORIES } from "@/lib/skills/engine";

export default function SkillsPage() {
  const [profile, setProfile] = useState<SkillProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch("/api/skills");
        if (!resp.ok) throw new Error("Failed to load skill data");
        const data = await resp.json();
        setProfile(data.profile);
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

  if (error || !profile) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <Trophy className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-600 dark:text-neutral-300 font-medium">
              {error || "No skill data available"}
            </p>
            <p className="text-sm text-neutral-400 mt-2">
              Run some scans to start building your accessibility skill profile.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const scoreColor =
    profile.overallScore >= 85 ? "text-green-600" :
    profile.overallScore >= 70 ? "text-yellow-600" :
    profile.overallScore >= 50 ? "text-orange-600" : "text-red-600";

  const ringColor =
    profile.overallScore >= 85 ? "#16a34a" :
    profile.overallScore >= 70 ? "#ca8a04" :
    profile.overallScore >= 50 ? "#ea580c" : "#dc2626";

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Developer Skills</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Track your accessibility expertise and earn badges
            </p>
          </div>
          <Link
            href="/learn"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
          >
            <BookOpen className="h-4 w-4" />
            Learning Paths
          </Link>
        </div>

        {/* Score Hero + Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score Ring */}
          <Card className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 lg:col-span-1">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className="relative">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="66" fill="none" stroke="currentColor" strokeWidth="10" className="text-neutral-100 dark:text-neutral-800" />
                  <circle
                    cx="80" cy="80" r="66"
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(profile.overallScore / 100) * 415} 415`}
                    transform="rotate(-90 80 80)"
                    style={{ filter: `drop-shadow(0 0 8px ${ringColor}40)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-black ${scoreColor}`}>{profile.overallScore}</span>
                  <span className="text-xs font-medium text-neutral-500 mt-1">{profile.level}</span>
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Accessibility Skill Score
              </p>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <Card className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 lg:col-span-2">
            <CardContent className="py-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Total Scans"
                  value={String(profile.totalScans)}
                  icon={<Target className="h-4 w-4 text-blue-500" />}
                />
                <StatCard
                  label="Violations Fixed"
                  value={String(profile.totalViolationsFixed)}
                  icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
                  sub={`${profile.fixRate}% fix rate`}
                />
                <StatCard
                  label="Best Score"
                  value={profile.bestScore.toFixed(1)}
                  icon={<Trophy className="h-4 w-4 text-amber-500" />}
                />
                <StatCard
                  label="Streak"
                  value={`${profile.improvementStreak}`}
                  icon={<Flame className="h-4 w-4 text-orange-500" />}
                  sub="consecutive improvements"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown */}
        <Card className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
              Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {profile.categories.map((cat) => (
                <CategoryRow key={cat.category} category={cat} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Badges Earned ({profile.badges.length})
              </CardTitle>
              {profile.nextBadge && (
                <span className="text-xs text-neutral-400">
                  Next: {profile.nextBadge.name}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {profile.badges.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {profile.badges.map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Award className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-500">
                  No badges yet — keep scanning and fixing!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recommendation */}
        {profile.weakestCategory && (
          <Card className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <BookOpen className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Recommended Focus Area
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Your weakest category is <strong>{SKILL_CATEGORIES[profile.weakestCategory].name}</strong>.{" "}
                    <Link href="/learn" className="underline hover:no-underline">
                      Start the learning path →
                    </Link>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

// ─────────────── Sub Components ───────────────

function StatCard({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="text-center p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <span className="text-2xl font-bold text-neutral-900 dark:text-white">{value}</span>
      </div>
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      {sub && <p className="text-[10px] text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function CategoryRow({ category }: { category: CategoryScore }) {
  const config = SKILL_CATEGORIES[category.category];
  const barColor =
    category.score >= 85 ? "bg-green-500" :
    category.score >= 70 ? "bg-yellow-500" :
    category.score >= 50 ? "bg-orange-500" : "bg-red-500";

  const TrendIcon = category.trend === "improving" ? TrendingUp :
                    category.trend === "declining" ? TrendingDown : Minus;
  const trendColor = category.trend === "improving" ? "text-green-500" :
                     category.trend === "declining" ? "text-red-500" : "text-neutral-400";

  return (
    <div className="flex items-center gap-4">
      <div className="w-36 shrink-0">
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{config.name}</p>
      </div>
      <div className="flex-1">
        <div className="h-2.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${category.score}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 w-20 justify-end">
        <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{category.score}</span>
        <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
      </div>
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  const tierColor = badge.tier === "gold" ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20" :
                    badge.tier === "silver" ? "border-neutral-400 bg-neutral-50 dark:bg-neutral-800/50" :
                    "border-orange-300 bg-orange-50 dark:bg-orange-900/20";

  return (
    <div className={`rounded-xl border ${tierColor} p-3 text-center`}>
      <div className="text-2xl mb-1">
        {badge.tier === "gold" ? "🏆" : badge.tier === "silver" ? "🥈" : "🥉"}
      </div>
      <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 leading-tight">
        {badge.name}
      </p>
      <p className="text-[10px] text-neutral-500 mt-1 leading-tight">
        {badge.description}
      </p>
    </div>
  );
}
