"use client";

/**
 * RegLayer — useSiteTrends Hook
 *
 * WHY: Trend dashboard needs to fetch/cache trend data and support
 *      client-side time range filtering without refetching.
 *
 * WHAT: Fetches /api/sites/[siteId]/trends once, then allows
 *       client-side filtering by time range (7D, 30D, 90D, All).
 *
 * HOW: Single fetch on mount. Filters applied client-side from full dataset.
 *      Provides loading/error state + filtered data for the active range.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import type {
  ScoreTrendPoint,
  ViolationTrendPoint,
  StreakData,
  ScoreDelta,
  TrendSummary,
} from "@/lib/analytics/trends";

// ─────────────── Types ───────────────

export type TimeRange = "7D" | "30D" | "90D" | "ALL";

interface TrendsApiResponse {
  siteId: string;
  siteName: string;
  siteUrl: string;
  scoreTrend: ScoreTrendPoint[];
  violationTrend: ViolationTrendPoint[];
  streak: StreakData;
  delta: ScoreDelta | null;
  summary: TrendSummary | null;
}

interface UseSiteTrendsReturn {
  /** Whether data is loading */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Full raw data from API */
  raw: TrendsApiResponse | null;
  /** Score trend filtered by active time range */
  scoreTrend: ScoreTrendPoint[];
  /** Violation trend filtered by active time range */
  violationTrend: ViolationTrendPoint[];
  /** Streak data (not time-filtered) */
  streak: StreakData | null;
  /** Delta from last two scans */
  delta: ScoreDelta | null;
  /** Summary stats */
  summary: TrendSummary | null;
  /** Site metadata */
  siteName: string;
  siteUrl: string;
  /** Current time range filter */
  timeRange: TimeRange;
  /** Change the time range filter (client-side, no refetch) */
  setTimeRange: (range: TimeRange) => void;
}

// ─────────────── Hook ───────────────

/**
 * Fetches and manages trend data for a site with client-side time filtering.
 *
 * @param siteId - The site to fetch trends for
 * @returns Trend data, loading state, and filter controls
 */
export function useSiteTrends(siteId: string): UseSiteTrendsReturn {
  const [raw, setRaw] = useState<TrendsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("30D");

  useEffect(() => {
    if (!siteId) return;

    let cancelled = false;

    fetch(`/api/sites/${siteId}/trends`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Site not found" : "Failed to load trends");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setRaw(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [siteId]);

  // Client-side time range filtering
  const cutoffDate = useMemo(() => {
    if (timeRange === "ALL") return null;
    const now = new Date();
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }, [timeRange]);

  const scoreTrend = useMemo(() => {
    const source = raw?.scoreTrend;
    if (!source || source.length === 0) return [];
    if (!cutoffDate) return source;
    return source.filter((p) => new Date(p.date) >= cutoffDate);
  }, [raw, cutoffDate]);

  const violationTrend = useMemo(() => {
    const source = raw?.violationTrend;
    if (!source || source.length === 0) return [];
    if (!cutoffDate) return source;
    return source.filter((p) => new Date(p.date) >= cutoffDate);
  }, [raw, cutoffDate]);

  const handleSetTimeRange = useCallback((range: TimeRange) => {
    setTimeRange(range);
  }, []);

  return {
    loading,
    error,
    raw,
    scoreTrend,
    violationTrend,
    streak: raw?.streak ?? null,
    delta: raw?.delta ?? null,
    summary: raw?.summary ?? null,
    siteName: raw?.siteName ?? "",
    siteUrl: raw?.siteUrl ?? "",
    timeRange,
    setTimeRange: handleSetTimeRange,
  };
}
