"use client";

/**
 * RegLayer — Scans History Page
 *
 * WHY: Users need to review past scan results, compare scores, and track progress.
 * WHAT: Lists all scans with filters (date, score, URL), pagination, and quick actions (view, compare, export).
 * HOW: Fetches /api/scans on mount, renders sortable table with scan metadata and score badges.
 */

import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { isWorkspaceAdmin } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  GitCompare,
  Share2,
  Clock,
  BarChart3,
  Check,
  Trash2,
  Search,
  Download,
  Filter,
  AlertTriangle,
  FileSearch,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useUrlState } from "@/hooks/use-url-state";
import { useSortable } from "@/hooks/use-sortable";
import { SortControl, type SortOption } from "@/components/ui/sort-control";
import { ModernSelect } from "@/components/ui/modern-select";

interface ScanRecord {
  id: string;
  url: string;
  score: number | null;
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  compliance: number | null;
  pageTitle: string | null;
  duration: number | null;
  createdAt: string;
  status: string;
}

// Stable accessor map for useSortable (defined outside the component so the
// sort only recomputes when the data/key/direction change).
const SCAN_ACCESSORS = {
  createdAt: (s: ScanRecord) => s.createdAt,
  score: (s: ScanRecord) => s.score,
  totalViolations: (s: ScanRecord) => s.totalViolations,
  url: (s: ScanRecord) => s.pageTitle || s.url,
} as const;

const SCAN_SORT_OPTIONS: SortOption[] = [
  { key: "createdAt", label: "Date" },
  { key: "score", label: "Score" },
  { key: "totalViolations", label: "Violations" },
  { key: "url", label: "Name" },
];

export default function ScansPage() {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useUrlState<string>("q", "");
  const [severityFilter, setSeverityFilter] = useUrlState<string>("severity", "all");
  const [dateFilter, setDateFilter] = useUrlState<string>("date", "all");
  const { data: session } = useSession();
  const { t } = useI18n();
  // Scan deletion is OWNER/ADMIN-or-master (scans.delete) — gate the button to match.
  const isAdmin = isWorkspaceAdmin(session);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/scans", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed with status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setScans(data.scans || []);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Unable to load your scans right now. Please try again.");
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Filtered scans
  const filteredScans = useMemo(() => {
    let result = scans;

    // Text search (URL or page title)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.url.toLowerCase().includes(q) ||
          (s.pageTitle && s.pageTitle.toLowerCase().includes(q))
      );
    }

    // Severity filter
    if (severityFilter !== "all") {
      result = result.filter((s) => {
        if (severityFilter === "critical") return s.critical > 0;
        if (severityFilter === "serious") return s.serious > 0;
        if (severityFilter === "clean") return s.totalViolations === 0;
        if (severityFilter === "failing") return (s.score ?? 0) < 70;
        return true;
      });
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const cutoff = new Date(
        dateFilter === "today" ? now.getTime() - 86400000 :
        dateFilter === "week" ? now.getTime() - 7 * 86400000 :
        dateFilter === "month" ? now.getTime() - 30 * 86400000 : 0
      );
      result = result.filter((s) => new Date(s.createdAt) >= cutoff);
    }

    return result;
  }, [scans, searchQuery, severityFilter, dateFilter]);

  // Sorted view of the filtered scans (default: newest first — matches the API order).
  const { sorted: sortedScans, sortKey, sortDir, toggleSort } = useSortable(
    filteredScans,
    { key: "createdAt", dir: "desc" },
    SCAN_ACCESSORS
  );

  // CSV export
  function handleExportCSV() {
    const headers = ["URL", "Page Title", "Score", "Critical", "Serious", "Moderate", "Minor", "Total Violations", "Date"];
    const rows = filteredScans.map((s) => [
      s.url,
      s.pageTitle || "",
      s.score?.toString() ?? "",
      s.critical.toString(),
      s.serious.toString(),
      s.moderate.toString(),
      s.minor.toString(),
      s.totalViolations.toString(),
      new Date(s.createdAt).toISOString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reglayer-scans-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/scans/${id}`, { method: "DELETE" });
    if (res.ok) {
      setScans((prev) => prev.filter((s) => s.id !== id));
      setSelectedScans((prev) => prev.filter((s) => s !== id));
    }
    setDeleteTarget(null);
  }

  function toggleSelect(id: string) {
    setSelectedScans((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : prev.length < 2
        ? [...prev, id]
        : [prev[1], id]
    );
  }

  function getTrend(list: ScanRecord[], index: number): "up" | "down" | "flat" {
    if (index >= list.length - 1) return "flat";
    const current = list[index].score ?? 0;
    const previous = list[index + 1].score ?? 0;
    if (current > previous) return "up";
    if (current < previous) return "down";
    return "flat";
  }

  const averageScore =
    filteredScans.length > 0
      ? Math.round(filteredScans.reduce((sum, s) => sum + (s.score ?? 0), 0) / filteredScans.length)
      : 0;

  const totalViolationsAll = filteredScans.reduce((sum, s) => sum + s.totalViolations, 0);

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("scans.title")}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t("scans.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedScans.length === 2 && (
              <Link
                href={`/scans/compare?base=${selectedScans[0]}&head=${selectedScans[1]}`}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
              >
                <GitCompare className="h-4 w-4" />
                {t("scans.compareSelected")}
              </Link>
            )}
            <Link
              href="/crawl"
              className="inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent/90 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              <FileSearch className="h-4 w-4" />
              Run Site Audit
            </Link>
          </div>
        </div>

        {/* Summary Stats */}
        {scans.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <SummaryCard
              label={t("scans.totalScans")}
              value={filteredScans.length.toString()}
              icon={<BarChart3 className="h-4 w-4 text-blue-500" />}
            />
            <SummaryCard
              label={t("scans.avgScore")}
              value={averageScore.toString()}
              icon={<TrendingUp className="h-4 w-4 text-green-500" />}
            />
            <SummaryCard
              label={t("scans.totalViolations")}
              value={totalViolationsAll.toString()}
              icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
            />
            <SummaryCard
              label={t("scans.latestScore")}
              value={scans[0]?.score?.toString() ?? "—"}
              icon={
                getTrend(filteredScans, 0) === "up" ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : getTrend(filteredScans, 0) === "down" ? (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                ) : (
                  <Minus className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                )
              }
            />
          </div>
        )}

        {/* Search, Filter & Export Bar */}
        {scans.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 dark:text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by URL or page title..."
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-9 pr-3 py-2 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Severity Filter */}
            <ModernSelect
              options={[
                { value: "all", label: "All Severities" },
                { value: "critical", label: "Has Critical" },
                { value: "serious", label: "Has Serious" },
                { value: "failing", label: "Score < 70" },
                { value: "clean", label: "Clean (0 violations)" },
              ]}
              value={severityFilter}
              onChange={setSeverityFilter}
            />

            {/* Date Filter */}
            <ModernSelect
              options={[
                { value: "all", label: "All Time" },
                { value: "today", label: "Last 24h" },
                { value: "week", label: "Last 7 days" },
                { value: "month", label: "Last 30 days" },
              ]}
              value={dateFilter}
              onChange={setDateFilter}
            />

            {/* Sort */}
            <SortControl
              options={SCAN_SORT_OPTIONS}
              sortKey={sortKey}
              sortDir={sortDir}
              onChangeKey={toggleSort}
              onToggleDir={() => toggleSort(sortKey)}
            />

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export{filteredScans.length !== scans.length ? ` ${filteredScans.length}` : ""} CSV
            </button>
          </div>
        )}

        {/* Scan List */}
        {loading ? (
          <PageLoading message="Loading your scans..." />
        ) : error ? (
          <PageError
            title="Couldn\u2019t load scans"
            message={error}
            onRetry={() => { setError(null); setLoading(true); fetch("/api/scans").then(r => r.json()).then(d => setScans(d.scans || [])).catch(() => setError("Unable to load your scans right now. Please try again.")).finally(() => setLoading(false)); }}
            fallbackHref="/dashboard"
          />
        ) : scans.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            iconColor="text-blue-400"
            title="No scans yet"
            description="Run your first accessibility scan to see results here. Each scan analyzes your website for WCAG compliance issues."
            actionLabel="Run First Scan"
            actionHref="/crawl"
            secondaryLabel="Learn More"
            secondaryHref="/learn"
            tips={[
              "Go to the Dashboard and enter any URL to scan",
              "Scans check for WCAG 2.2 AA compliance issues",
              "Results include severity ratings and fix suggestions",
              "Compare scans over time to track your progress",
            ]}
          />
        ) : filteredScans.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <Search className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-neutral-700 dark:text-neutral-200">No matching scans</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Compare hint — always visible, contextual */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              selectedScans.length === 0
                ? "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
                : selectedScans.length === 1
                ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50"
                : "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/50"
            }`}>
              <GitCompare className={`h-4 w-4 shrink-0 ${
                selectedScans.length === 2 ? "text-green-600" : selectedScans.length === 1 ? "text-blue-500" : "text-neutral-400"
              }`} />
              <p className="text-xs text-neutral-600 dark:text-neutral-300 flex-1">
                {selectedScans.length === 0 && "Select 2 scans to compare scores, violations & progress over time"}
                {selectedScans.length === 1 && "1 selected — pick one more to compare"}
                {selectedScans.length === 2 && (
                  <span className="font-medium text-green-700 dark:text-green-300">Ready to compare!</span>
                )}
              </p>
              {selectedScans.length === 2 && (
                <Link
                  href={`/scans/compare?base=${selectedScans[0]}&head=${selectedScans[1]}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors"
                >
                  <GitCompare className="h-3 w-3" /> Compare Now
                </Link>
              )}
              {selectedScans.length > 0 && selectedScans.length < 2 && (
                <button
                  onClick={() => setSelectedScans([])}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  Clear
                </button>
              )}
            </div>
            {sortedScans.map((scan, index) => (
              <div
                key={scan.id}
                className={`group rounded-xl border bg-white dark:bg-neutral-900 p-4 sm:p-5 transition-all hover:shadow-md ${
                  selectedScans.includes(scan.id)
                    ? "border-blue-300 dark:border-blue-700 ring-2 ring-blue-100 dark:ring-blue-900"
                    : "border-neutral-200 dark:border-neutral-700"
                }`}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(scan.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      selectedScans.includes(scan.id)
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-neutral-300 dark:border-neutral-600 hover:border-blue-400"
                    }`}
                  >
                    {selectedScans.includes(scan.id) && (
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                  </button>

                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-2xl font-bold ${
                        (scan.score ?? 0) >= 90
                          ? "text-emerald-600"
                          : (scan.score ?? 0) >= 70
                          ? "text-green-600"
                          : (scan.score ?? 0) >= 50
                          ? "text-amber-500"
                          : "text-red-500"
                      }`}
                    >
                      {scan.score !== null ? Math.round(scan.score) : "—"}
                    </span>
                    {getTrend(sortedScans, index) === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
                    {getTrend(sortedScans, index) === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/report/${scan.id}`}
                      className="text-sm font-medium text-neutral-900 dark:text-white truncate block hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {scan.pageTitle || scan.url}
                    </Link>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{scan.url}</p>
                  </div>

                  {/* Violations */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    {scan.critical > 0 && <Badge variant="critical">{scan.critical}</Badge>}
                    {scan.serious > 0 && <Badge variant="serious">{scan.serious}</Badge>}
                    {scan.moderate > 0 && <Badge variant="moderate">{scan.moderate}</Badge>}
                    {scan.minor > 0 && <Badge variant="minor">{scan.minor}</Badge>}
                    {scan.totalViolations === 0 && <Badge variant="success">Clean</Badge>}
                  </div>

                  {/* Meta */}
                  <div className="hidden md:block text-right">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {new Date(scan.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {scan.duration && (
                      <p className="text-xs text-neutral-300">{scan.duration >= 1000 ? `${(scan.duration / 1000).toFixed(1)}s` : `${scan.duration}ms`}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/report/${scan.id}`}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600 dark:hover:text-white dark:text-neutral-300"
                      title="View Report"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <CopyLinkButton scanId={scan.id} />
                    {isAdmin && (
                      <button
                        onClick={() => setDeleteTarget(scan.id)}
                        className="rounded-md p-1.5 text-neutral-500 dark:text-neutral-300 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Delete Scan (Admin only)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete scan"
        description="Are you sure you want to delete this scan? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
}

function CopyLinkButton({ scanId }: { scanId: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(`${window.location.origin}/report/${scanId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600 dark:hover:text-white dark:text-neutral-300 transition-colors"
        title="Copy Share Link"
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
      </button>
      {copied && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-neutral-900 px-2 py-1 text-xs text-white whitespace-nowrap animate-in fade-in slide-in-from-bottom-1 duration-200">
          Copied!
        </span>
      )}
    </div>
  );
}
