"use client";

/**
 * RegLayer — The Fix Flow
 *
 * WHY: 90% of users scan but never fix. The violation list is paralyzing.
 *      This page solves: "What do I fix NEXT?" with zero overwhelm.
 *
 * WHAT: One card at a time. Each card shows:
 *   - What's wrong (plain English)
 *   - Who's hurt (disability population)
 *   - Broken code → Fixed code (copy-paste)
 *   - Point gain preview
 *   - "Fixed it → Next" button
 *
 * HOW: Fetches /api/fix-flow/[scanId], renders one card at a time with
 *      a progress bar and running score estimate. Like Duolingo for accessibility.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
import {
  CheckCircle2,
  Copy,
  Trophy,
  Zap,
  Users,
  Code2,
  ArrowRight,
} from "lucide-react";
import type { FixCard } from "@/lib/intelligence/fix-prioritizer";

interface FixFlowData {
  scanId: string;
  url: string;
  totalCards: number;
  cards: FixCard[];
}

export default function FixFlowPage() {
  const params = useParams();
  const scanId = params.id as string;

  const [data, setData] = useState<FixFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    fetch(`/api/fix-flow/${scanId}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Scan not found" : "Failed to load fixes");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [scanId]);

  const currentCard = data?.cards[currentIndex] ?? null;
  const totalCards = data?.totalCards ?? 0;
  const completedCount = completedIds.size;
  const pointsEarned = data?.cards
    .filter((c) => completedIds.has(c.id))
    .reduce((sum, c) => sum + c.pointGain, 0) ?? 0;

  const handleCopy = useCallback(async () => {
    if (!currentCard) return;
    await navigator.clipboard.writeText(currentCard.fixedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [currentCard]);

  const handleMarkFixed = useCallback(() => {
    if (!currentCard) return;
    setCompletedIds((prev) => new Set(prev).add(currentCard.id));

    // Move to next unfixed card
    if (data) {
      const nextIndex = data.cards.findIndex(
        (c, i) => i > currentIndex && !completedIds.has(c.id)
      );
      if (nextIndex !== -1) {
        setCurrentIndex(nextIndex);
      } else {
        // All done!
        setShowCelebration(true);
      }
    }
  }, [currentCard, currentIndex, data, completedIds]);

  const handleSkip = useCallback(() => {
    if (!data) return;
    const nextIndex = data.cards.findIndex(
      (c, i) => i > currentIndex && !completedIds.has(c.id)
    );
    if (nextIndex !== -1) {
      setCurrentIndex(nextIndex);
    }
  }, [data, currentIndex, completedIds]);

  // ─────────────── Loading / Error States ───────────────

  if (loading) {
    return (
      <AppShell>
        <PageLoading message="Preparing your fix flow..." />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <PageError
          title="Couldn\u2019t load fix flow"
          message="We\u2019re having trouble preparing your fixes. Please try again."
          onRetry={() => window.location.reload()}
          fallbackHref="/scans"
          fallbackLabel="Back to Scans"
        />
      </AppShell>
    );
  }

  if (totalCards === 0) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Trophy className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">No violations found!</h2>
            <p className="text-neutral-500 mt-2">This scan is clean. Nothing to fix.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ─────────────── Celebration Screen ───────────────

  if (showCelebration) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-md">
            <div className="relative mb-6">
              <Trophy className="w-20 h-20 text-yellow-500 mx-auto" />
              <div className="absolute -top-2 -right-2 animate-bounce">
                <Zap className="w-8 h-8 text-yellow-400" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
              Flow Complete!
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-300 mb-4">
              You addressed <span className="font-bold text-green-600">{completedCount}</span> violations
            </p>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-green-700 dark:text-green-300">
                Estimated score improvement
              </p>
              <p className="text-3xl font-bold text-green-600">
                +{pointsEarned} points
              </p>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Re-scan your site to see the updated AIS score.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ─────────────── Main Fix Card ───────────────

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Fix Flow</h1>
              <Badge variant="outline" className="text-xs">
                {completedCount}/{totalCards} fixed
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                +{pointsEarned} pts
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(completedCount / totalCards) * 100}%` }}
            />
          </div>
        </div>

        {/* Fix Card */}
        {currentCard && (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-sm overflow-hidden">
            {/* Card Header — Impact Badge + Category */}
            <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ImpactDot impact={currentCard.impact} />
                <span className="font-medium text-neutral-900 dark:text-white text-sm">
                  {currentCard.ruleId}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <EffortBadge effort={currentCard.effort} />
                <Badge variant="outline" className="text-xs capitalize">
                  {currentCard.category.replace(/-/g, " ")}
                </Badge>
              </div>
            </div>

            {/* Problem Statement */}
            <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                {currentCard.problem}
              </h2>
              <div className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <Users className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                <span>{currentCard.whoIsAffected}</span>
              </div>
            </div>

            {/* Code: Before → After */}
            <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800">
              {/* Broken Code */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Current (broken)
                  </span>
                </div>
                <pre className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg px-4 py-3 overflow-x-auto">
                  <code className="text-sm text-red-800 dark:text-red-300 whitespace-pre-wrap break-all">
                    {currentCard.brokenCode}
                  </code>
                </pre>
              </div>

              {/* Fixed Code */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                      Fixed (copy this)
                    </span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-lg px-4 py-3 overflow-x-auto">
                  <code className="text-sm text-green-800 dark:text-green-300 whitespace-pre-wrap break-all">
                    {currentCard.fixedCode}
                  </code>
                </pre>
              </div>

              {/* What Changed */}
              <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400 italic">
                <Code2 className="w-3.5 h-3.5 inline mr-1" />
                {currentCard.whatChanged}
              </p>
            </div>

            {/* Point Preview */}
            <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <Zap className="w-4 h-4 text-yellow-500" />
                Fixing this earns ~<span className="font-bold text-neutral-900 dark:text-white">{currentCard.pointGain}</span> AIS points
              </div>
              <span className="text-xs text-neutral-400">
                Card {currentIndex + 1} of {totalCards}
              </span>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800">
              <button
                onClick={handleSkip}
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
              >
                Skip for now
              </button>
              <Button onClick={handleMarkFixed} size="lg" className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Fixed it
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <StatCard
            label="Remaining"
            value={totalCards - completedCount}
            color="text-neutral-600 dark:text-neutral-300"
          />
          <StatCard
            label="Points earned"
            value={`+${pointsEarned}`}
            color="text-green-600"
          />
          <StatCard
            label="Time saved"
            value={`~${completedCount * 2}min`}
            color="text-blue-600"
          />
        </div>
      </div>
    </AppShell>
  );
}

// ─────────────── Sub Components ───────────────

function ImpactDot({ impact }: { impact: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500",
    serious: "bg-orange-500",
    moderate: "bg-yellow-500",
    minor: "bg-blue-400",
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-full ${colors[impact] ?? "bg-neutral-400"}`} />
      <span className="text-xs font-medium text-neutral-500 capitalize">{impact}</span>
    </div>
  );
}

function EffortBadge({ effort }: { effort: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    low: { bg: "bg-green-100 dark:bg-green-900/20", text: "text-green-700 dark:text-green-300", label: "Quick fix" },
    medium: { bg: "bg-yellow-100 dark:bg-yellow-900/20", text: "text-yellow-700 dark:text-yellow-300", label: "Some effort" },
    high: { bg: "bg-red-100 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", label: "Restructure" },
  };
  const c = config[effort] ?? config.medium;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}
