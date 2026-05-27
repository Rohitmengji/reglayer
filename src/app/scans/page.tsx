"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
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
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

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

export default function ScansPage() {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const { data: session } = useSession();
  const { t } = useI18n();
  const isAdmin = (session?.user as unknown as { role?: string })?.role === "admin";

  useEffect(() => {
    fetch("/api/scans")
      .then((r) => r.json())
      .then((data) => {
        setScans(data.scans || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filtered scans
  // eslint-disable-next-line react-hooks/purity
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

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this scan?")) return;
    const res = await fetch(`/api/scans/${id}`, { method: "DELETE" });
    if (res.ok) {
      setScans((prev) => prev.filter((s) => s.id !== id));
      setSelectedScans((prev) => prev.filter((s) => s !== id));
    }
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

  function getTrend(index: number): "up" | "down" | "flat" {
    if (index >= filteredScans.length - 1) return "flat";
    const current = filteredScans[index].score ?? 0;
    const previous = filteredScans[index + 1].score ?? 0;
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
          {selectedScans.length === 2 && (
            <Link
              href={`/scans/compare?base=${selectedScans[0]}&head=${selectedScans[1]}`}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              <GitCompare className="h-4 w-4" />
              {t("scans.compareSelected")}
            </Link>
          )}
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
              icon={<Clock className="h-4 w-4 text-orange-500" />}
            />
            <SummaryCard
              label={t("scans.latestScore")}
              value={scans[0]?.score?.toString() ?? "—"}
              icon={
                getTrend(0) === "up" ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : getTrend(0) === "down" ? (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                ) : (
                  <Minus className="h-4 w-4 text-neutral-400" />
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by URL or page title..."
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-9 pr-3 py-2 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Severity Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="appearance-none rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-9 pr-8 py-2 text-sm text-neutral-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Severities</option>
                <option value="critical">Has Critical</option>
                <option value="serious">Has Serious</option>
                <option value="failing">Score &lt; 70</option>
                <option value="clean">Clean (0 violations)</option>
              </select>
            </div>

            {/* Date Filter */}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="appearance-none rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="all">All Time</option>
              <option value="today">Last 24h</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        )}

        {/* Scan List */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <BarChart3 className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-neutral-700 dark:text-neutral-200">{t("scans.noScansTitle")}</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              {t("scans.noScansSubtitle")}{" "}
              <Link href="/dashboard" className="text-blue-600 hover:underline">
                {t("scans.dashboard")}
              </Link>
              .
            </p>
          </div>
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
            <p className="text-xs text-neutral-400">
              {t("scans.selectHint")}
            </p>
            {filteredScans.map((scan, index) => (
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
                          ? "text-green-600"
                          : (scan.score ?? 0) >= 70
                          ? "text-yellow-600"
                          : (scan.score ?? 0) >= 50
                          ? "text-orange-600"
                          : "text-red-600"
                      }`}
                    >
                      {scan.score !== null ? Math.round(scan.score) : "—"}
                    </span>
                    {getTrend(index) === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
                    {getTrend(index) === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                      {scan.pageTitle || scan.url}
                    </p>
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
                    <p className="text-xs text-neutral-400">
                      {new Date(scan.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {scan.duration && (
                      <p className="text-xs text-neutral-300">{scan.duration}ms</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        onClick={() => handleDelete(scan.id)}
                        className="rounded-md p-1.5 text-neutral-400 dark:text-neutral-300 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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
