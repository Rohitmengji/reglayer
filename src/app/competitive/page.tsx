/**
 * RegLayer — Competitive Intelligence Dashboard
 *
 * Track and benchmark your accessibility score against competitors.
 * Provides leaderboard, trend charts, and scan-on-demand capability.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  Plus,
  Trash2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  BarChart3,
  Globe,
  Loader2,
  AlertCircle,
  Crown,
  Medal,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompetitorEntry {
  id: string;
  url: string;
  name: string | null;
  industry: string | null;
  createdAt: string;
  latestSnapshot: {
    score: number;
    totalViolations: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    pageTitle: string | null;
    topIssues: Array<{ ruleId: string; count: number }>;
    scannedAt: string;
  } | null;
  trend: number | null;
}

interface Benchmark {
  yourScore: number | null;
  yourRank: number;
  totalCompetitors: number;
  leaderboard: Array<{
    name: string;
    url: string;
    score: number;
    change: number | null;
    isYou: boolean;
  }>;
  industryAverage: number | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CompetitivePage() {
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null); // competitorId or "all"
  const [error, setError] = useState<string | null>(null);

  // Add competitor form
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [compRes, benchRes] = await Promise.all([
        fetch("/api/competitive"),
        fetch("/api/competitive?mode=benchmark"),
      ]);
      if (compRes.ok) {
        const data = await compRes.json();
        setCompetitors(data.competitors || []);
      }
      if (benchRes.ok) {
        const data = await benchRes.json();
        setBenchmark(data);
      }
    } catch {
      setError("Failed to load competitive data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    if (!addUrl.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/competitive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addUrl.trim(), name: addName.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add competitor");
        return;
      }
      setAddUrl("");
      setAddName("");
      setShowAdd(false);
      await loadData();
    } catch {
      setError("Failed to add competitor");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (competitorId: string) => {
    try {
      await fetch("/api/competitive", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorId }),
      });
      await loadData();
    } catch {
      setError("Failed to remove competitor");
    }
  };

  const handleScan = async (competitorId?: string) => {
    setScanning(competitorId || "all");
    setError(null);
    try {
      const res = await fetch("/api/competitive/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(competitorId ? { competitorId } : { all: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Scan failed");
        return;
      }
      await loadData();
    } catch {
      setError("Scan failed");
    } finally {
      setScanning(null);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-8 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-amber-500" />
              Competitive Intelligence
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-1">
              Benchmark your accessibility against competitors
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleScan()}
              disabled={scanning !== null || competitors.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors text-sm font-medium"
            >
              {scanning === "all" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Scan All
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              Add Competitor
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Add Competitor Form */}
        {showAdd && (
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 space-y-3 bg-white dark:bg-neutral-900">
            <h3 className="font-medium">Add Competitor</h3>
            <div className="flex gap-3">
              <input
                type="url"
                placeholder="https://competitor.com"
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                className="flex-1 px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Display name (optional)"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-48 px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={adding || !addUrl.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {adding ? "Adding..." : "Add & Track"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddUrl(""); setAddName(""); }}
                className="px-4 py-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Benchmark Summary */}
        {benchmark && benchmark.totalCompetitors > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              label="Your Score"
              value={benchmark.yourScore !== null ? String(benchmark.yourScore) : "—"}
              icon={<Target className="h-5 w-5 text-blue-500" />}
            />
            <StatCard
              label="Your Rank"
              value={benchmark.yourRank > 0 ? `#${benchmark.yourRank}` : "—"}
              subtitle={`of ${benchmark.totalCompetitors + 1}`}
              icon={<Trophy className="h-5 w-5 text-amber-500" />}
            />
            <StatCard
              label="Industry Average"
              value={benchmark.industryAverage !== null ? String(benchmark.industryAverage) : "—"}
              icon={<BarChart3 className="h-5 w-5 text-purple-500" />}
            />
            <StatCard
              label="Competitors Tracked"
              value={String(benchmark.totalCompetitors)}
              icon={<Globe className="h-5 w-5 text-emerald-500" />}
            />
          </div>
        )}

        {/* Leaderboard */}
        {benchmark && benchmark.leaderboard.length > 0 && (
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
              <h2 className="font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Leaderboard
              </h2>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {benchmark.leaderboard.map((entry, idx) => (
                <div
                  key={entry.url + idx}
                  className={`flex items-center justify-between px-4 py-3 ${
                    entry.isYou ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <RankBadge rank={idx + 1} />
                    <div>
                      <p className={`font-medium text-sm ${entry.isYou ? "text-blue-600 dark:text-blue-400" : ""}`}>
                        {entry.name}
                        {entry.isYou && (
                          <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            YOU
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-neutral-500">{entry.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {entry.change !== null && (
                      <TrendIndicator value={entry.change} />
                    )}
                    <ScoreBadge score={entry.score} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Competitor Cards */}
        {competitors.length > 0 && (
          <div>
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Tracked Competitors ({competitors.length}/10)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {competitors.map((c) => (
                <CompetitorCard
                  key={c.id}
                  competitor={c}
                  scanning={scanning === c.id}
                  onScan={() => handleScan(c.id)}
                  onRemove={() => handleRemove(c.id)}
                  disabled={scanning !== null}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {competitors.length === 0 && !showAdd && (
          <div className="text-center py-16 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
            <Trophy className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No competitors tracked yet</h3>
            <p className="text-neutral-500 dark:text-neutral-400 mb-4 max-w-md mx-auto">
              Add your competitors to benchmark your accessibility score and see how you rank in your industry.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Add Your First Competitor
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatCard({ label, value, subtitle, icon }: { label: string; value: string; subtitle?: string; icon: React.ReactNode }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-amber-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-neutral-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="w-5 text-center text-sm text-neutral-400 font-medium">{rank}</span>;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : score >= 70
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`px-2.5 py-1 rounded-full text-sm font-semibold ${color}`}>
      {score}
    </span>
  );
}

function TrendIndicator({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="h-3 w-3" />+{value}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400">
        <TrendingDown className="h-3 w-3" />{value}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-neutral-400">
      <Minus className="h-3 w-3" />0
    </span>
  );
}

function CompetitorCard({
  competitor,
  scanning,
  onScan,
  onRemove,
  disabled,
}: {
  competitor: CompetitorEntry;
  scanning: boolean;
  onScan: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const snap = competitor.latestSnapshot;

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{competitor.name || new URL(competitor.url).hostname}</p>
          <p className="text-xs text-neutral-500 truncate">{competitor.url}</p>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={onScan}
            disabled={disabled}
            title="Scan now"
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 text-neutral-500" />
            )}
          </button>
          <button
            onClick={onRemove}
            title="Remove competitor"
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-neutral-500 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {snap ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">Score</span>
            <div className="flex items-center gap-2">
              {competitor.trend !== null && <TrendIndicator value={competitor.trend} />}
              <ScoreBadge score={snap.score} />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-neutral-500">Violations</span>
            <span className="font-medium">{snap.totalViolations}</span>
          </div>
          {snap.critical > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Critical</span>
              <span className="font-medium text-red-600">{snap.critical}</span>
            </div>
          )}
          <p className="text-xs text-neutral-400 pt-1">
            Last scanned: {new Date(snap.scannedAt).toLocaleDateString()}
          </p>
        </div>
      ) : (
        <p className="text-sm text-neutral-400 italic">Not scanned yet — click refresh to scan</p>
      )}
    </div>
  );
}
