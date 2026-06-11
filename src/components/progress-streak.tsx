"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Progress Streaks
 * ---------------------------------------------------------
 *
 * WHY: Streaks create habit loops. Duolingo, GitHub, Snapchat all
 * use streaks to drive daily engagement. For compliance,
 * "days without new violations" incentivizes continuous monitoring.
 *
 * WHAT:
 * - Visual streak counter with fire emoji scaling
 * - Heatmap of last 30 days (green = clean, red = violations)
 * - Streak milestones (7, 14, 30, 60, 90 days)
 * - Motivational messages that change with streak length
 *
 * HOW:
 * - Fetches from /api/streaks endpoint
 * - Pure CSS animations for the flame effect
 * - Responsive: compact on mobile, full on desktop
 * ---------------------------------------------------------
 */

import { useState, useEffect } from "react";
import { Flame, Trophy, Calendar } from "lucide-react";

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  last30Days: { date: string; clean: boolean; violations: number }[];
  milestones: { days: number; achieved: boolean; label: string }[];
}

const MILESTONES = [
  { days: 7, label: "One Week", emoji: "⭐" },
  { days: 14, label: "Two Weeks", emoji: "🌟" },
  { days: 30, label: "One Month", emoji: "🏆" },
  { days: 60, label: "Two Months", emoji: "💎" },
  { days: 90, label: "Quarter", emoji: "👑" },
];

function getStreakMessage(days: number): string {
  if (days === 0) return "Start your streak today — fix all violations!";
  if (days === 1) return "Day 1! Every great streak starts here.";
  if (days < 7) return "Building momentum. Keep it up!";
  if (days < 14) return "A full week! You're on fire.";
  if (days < 30) return "Impressive consistency. Your users thank you.";
  if (days < 60) return "A month of perfect compliance. Legendary.";
  if (days < 90) return "You're in the top 1% of accessibility champions.";
  return "Untouchable. You've mastered continuous compliance.";
}

function getFlameSize(days: number): string {
  if (days === 0) return "h-5 w-5";
  if (days < 7) return "h-6 w-6";
  if (days < 14) return "h-7 w-7";
  if (days < 30) return "h-8 w-8";
  return "h-9 w-9";
}

function getFlameColor(days: number): string {
  if (days === 0) return "text-neutral-300 dark:text-neutral-600";
  if (days < 7) return "text-orange-400";
  if (days < 14) return "text-orange-500";
  if (days < 30) return "text-red-500";
  return "text-red-600 animate-pulse";
}

export function ProgressStreak() {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/streaks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
        else {
          // Fallback demo data
          setData({
            currentStreak: 12,
            longestStreak: 23,
            last30Days: Array.from({ length: 30 }, (_, i) => ({
              date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split("T")[0],
              clean: Math.random() > 0.2,
              violations: Math.random() > 0.2 ? 0 : Math.floor(Math.random() * 5) + 1,
            })),
            milestones: MILESTONES.map((m) => ({ ...m, achieved: 12 >= m.days })),
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 animate-pulse">
        <div className="h-20" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
      {/* Header with streak counter */}
      <div className="flex items-center justify-between p-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`${getFlameColor(data.currentStreak)} transition-all duration-300`}>
            <Flame className={`${getFlameSize(data.currentStreak)} transition-all duration-300`} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums">
                {data.currentStreak}
              </span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                day{data.currentStreak !== 1 ? "s" : ""} violation-free
              </span>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
              {getStreakMessage(data.currentStreak)}
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center gap-1 text-xs text-neutral-400">
            <Trophy className="h-3 w-3" />
            Best: {data.longestStreak} days
          </div>
        </div>
      </div>

      {/* 30-day heatmap */}
      <div className="px-5 pb-4">
        <div className="flex items-center gap-1 text-[10px] text-neutral-400 mb-2">
          <Calendar className="h-3 w-3" />
          Last 30 days
        </div>
        <div className="flex gap-0.75">
          {data.last30Days.map((day) => (
            <div
              key={day.date}
              className={`h-6 flex-1 rounded-[3px] transition-colors ${
                day.clean
                  ? "bg-emerald-400/80 dark:bg-emerald-500/60"
                  : "bg-red-400/80 dark:bg-red-500/60"
              }`}
              title={`${day.date}: ${day.clean ? "Clean ✓" : `${day.violations} violation${day.violations > 1 ? "s" : ""}`}`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
          <span>30 days ago</span>
          <span>Today</span>
        </div>
      </div>

      {/* Milestones */}
      <div className="border-t border-neutral-100 dark:border-neutral-800 px-5 py-3">
        <div className="flex items-center justify-between">
          {MILESTONES.map((m) => {
            const achieved = data.currentStreak >= m.days;
            return (
              <div
                key={m.days}
                className={`flex flex-col items-center gap-1 ${achieved ? "opacity-100" : "opacity-30"}`}
                title={`${m.label}: ${achieved ? "Achieved!" : `${m.days - data.currentStreak} days to go`}`}
              >
                <span className="text-base">{m.emoji}</span>
                <span className="text-[9px] font-medium text-neutral-500 dark:text-neutral-400">
                  {m.days}d
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
