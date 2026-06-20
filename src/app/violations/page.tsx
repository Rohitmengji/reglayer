"use client";

/**
 * RegLayer — Violations Management Page
 *
 * WHY: Users need a dedicated page to manage violations like Sentry issues —
 *      filter by status, bulk-update, see progress at a glance.
 *
 * WHAT: Filter bar (by status) + summary bar (counts) + paginated violation cards
 *       + bulk actions (mark in-progress, won't-fix) + checkbox selection.
 *
 * HOW: Fetches GET /api/violations?scanId=&status=&page= with pagination.
 *      Uses EnhancedViolationCard for each violation. Client-side filter
 *      tabs trigger refetch.
 */

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/i18n-provider";
import { useSearchParams } from "next/navigation";
import { useUrlState } from "@/hooks/use-url-state";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
import { Button } from "@/components/ui/button";
import { EnhancedViolationCard } from "@/components/violations/EnhancedViolationCard";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ViolationStatus } from "@/generated/prisma/client";
import type { ViolationCardData } from "@/components/violations/EnhancedViolationCard";

// ─────────────── Types ───────────────

interface ViolationsResponse {
  violations: ViolationCardData[];
  summary: Record<string, number>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─────────────── Filter Tabs ───────────────

const STATUS_TABS: Array<{ key: string; label: string; icon: typeof AlertTriangle; color: string }> = [
  { key: "ALL", label: "All", icon: AlertTriangle, color: "text-neutral-600" },
  { key: "OPEN", label: "Open", icon: AlertTriangle, color: "text-red-600" },
  { key: "IN_PROGRESS", label: "In Progress", icon: Clock, color: "text-amber-600" },
  { key: "FIXED", label: "Fixed", icon: CheckCircle2, color: "text-blue-600" },
  { key: "VERIFIED", label: "Verified", icon: CheckCircle2, color: "text-green-600" },
  { key: "EXCEPTIONS", label: "Exceptions", icon: Shield, color: "text-neutral-500" },
];

// ─────────────── Page Component ───────────────

export default function ViolationsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const scanIdParam = searchParams.get("scanId") ?? "";

  const [resolvedScanId, setResolvedScanId] = useState(scanIdParam);
  const [data, setData] = useState<ViolationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useUrlState<string>("status", "ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // If no scanId provided, resolve latest scan
  const effectiveScanId = scanIdParam || resolvedScanId;

  useEffect(() => {
    if (scanIdParam) return;
    fetch("/api/scans?limit=1")
      .then((resp) => {
        if (!resp.ok) throw new Error("Failed to load latest scan.");
        return resp.json();
      })
      .then((json) => {
        if (json?.scans?.[0]?.id) {
          setResolvedScanId(json.scans[0].id);
        } else {
          setError("No scans found. Run a scan first.");
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load latest scan.");
        setLoading(false);
      });
  }, [scanIdParam]);

  const fetchViolations = useCallback(async () => {
    if (!effectiveScanId) {
      return;
    }

    setLoading(true);
    setError(null);

    // Map tab to status query
    let statusParam = "";
    if (activeTab === "EXCEPTIONS") {
      // Both exception statuses in ONE query — the API does `status IN (...)`, so
      // pagination and `total` stay correct (was two paged fetches concatenated,
      // which over-filled pages and desynced the page count).
      statusParam = "WONT_FIX,ACCEPTABLE_RISK";
    } else if (activeTab !== "ALL") {
      statusParam = activeTab;
    }

    const params = new URLSearchParams({
      scanId: effectiveScanId,
      page: String(currentPage),
      limit: "25",
    });
    if (statusParam) params.set("status", statusParam);

    try {
      const response = await fetch(`/api/violations?${params}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: "Failed to load" }));
        throw new Error(errData.message ?? `Error ${response.status}`);
      }
      const result: ViolationsResponse = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load violations");
    } finally {
      setLoading(false);
    }
  }, [effectiveScanId, activeTab, currentPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern requires setState
    fetchViolations();
  }, [fetchViolations]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [setActiveTab]);

  const handleCheckbox = useCallback((violationId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(violationId);
      else next.delete(violationId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!data) return;
    if (selectedIds.size === data.violations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.violations.map((v) => v.id)));
    }
  }, [data, selectedIds.size]);

  const handleBulkAction = useCallback(
    async (status: ViolationStatus, note?: string) => {
      if (selectedIds.size === 0) return;
      setBulkUpdating(true);

      const promises = [...selectedIds].map((violationId) =>
        fetch("/api/violations/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ violationId, status, note }),
        })
      );

      // Don't swallow failures: count rejections + non-OK responses and surface
      // them, so a bulk action that partially (or fully) failed isn't silently
      // reported as success.
      const results = await Promise.allSettled(promises);
      const failed = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)
      ).length;
      setBulkUpdating(false);
      setSelectedIds(new Set());
      // Non-intrusive feedback (a full-page error would wipe the list).
      if (failed > 0) {
        toast.error(`${failed} of ${promises.length} update${promises.length === 1 ? "" : "s"} failed — please retry.`);
      } else {
        toast.success(`Updated ${promises.length} violation${promises.length === 1 ? "" : "s"}.`);
      }
      fetchViolations(); // Refresh
    },
    [selectedIds, fetchViolations]
  );

  const handleStatusChange = useCallback(() => {
    // Refresh when a single card's status changes
    fetchViolations();
  }, [fetchViolations]);

  // ─────────────── Summary Counts ───────────────

  const summary = data?.summary ?? {};
  const totalOpen = summary.OPEN ?? 0;
  const totalInProgress = summary.IN_PROGRESS ?? 0;
  const totalFixed = summary.FIXED ?? 0;
  const totalVerified = summary.VERIFIED ?? 0;
  const totalExceptions = (summary.WONT_FIX ?? 0) + (summary.ACCEPTABLE_RISK ?? 0);

  // ─────────────── Render ───────────────

  if (!effectiveScanId && !loading && error) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <p className="text-neutral-500">{error}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("violations.title")}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Track and manage accessibility issues across your scan
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard
            label="Open"
            value={totalOpen}
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            active={activeTab === "OPEN"}
            onClick={() => handleTabChange("OPEN")}
          />
          <SummaryCard
            label="In Progress"
            value={totalInProgress}
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            active={activeTab === "IN_PROGRESS"}
            onClick={() => handleTabChange("IN_PROGRESS")}
          />
          <SummaryCard
            label="Fixed"
            value={totalFixed}
            icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />}
            active={activeTab === "FIXED"}
            onClick={() => handleTabChange("FIXED")}
          />
          <SummaryCard
            label="Verified"
            value={totalVerified}
            icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
            active={activeTab === "VERIFIED"}
            onClick={() => handleTabChange("VERIFIED")}
          />
          <SummaryCard
            label="Exceptions"
            value={totalExceptions}
            icon={<Shield className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />}
            active={activeTab === "EXCEPTIONS"}
            onClick={() => handleTabChange("EXCEPTIONS")}
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
                aria-selected={isActive}
                role="tab"
              >
                <TabIcon className={`h-3.5 w-3.5 ${isActive ? tab.color : ""}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Bulk Actions (shown when items selected) */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 px-4 py-3">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {selectedIds.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction("IN_PROGRESS" as ViolationStatus)}
              disabled={bulkUpdating}
            >
              Mark In Progress
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction("FIXED" as ViolationStatus)}
              disabled={bulkUpdating}
            >
              Mark Fixed
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto"
            >
              Clear Selection
            </Button>
          </div>
        )}

        {/* Select All + Violations List */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
          {/* Select All Header */}
          {data && data.violations.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
              <input
                type="checkbox"
                checked={selectedIds.size === data.violations.length && data.violations.length > 0}
                onChange={() => handleSelectAll()}
                className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-neutral-900 focus:ring-neutral-500"
                aria-label="Select all violations"
              />
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Select all on this page
              </span>
              {data.total > 0 && (
                <span className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
                  {data.total} violation{data.total !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Violations List */}
          {loading ? (
            <PageLoading message="Loading violations..." />
          ) : error ? (
            <PageError
              title="Couldn\u2019t load violations"
              message="We\u2019re having trouble loading your violations. Please try again."
              onRetry={() => fetchViolations()}
            />
          ) : data && data.violations.length === 0 ? (
            activeTab === "ALL" && !scanIdParam ? (
              <EmptyState
                icon={CheckCircle2}
                iconColor="text-green-500"
                title="No violations found"
                description="Run a scan first to see accessibility violations here. You can track, prioritize, and resolve issues from this page."
                actionLabel="Run a Scan"
                actionHref="/dashboard"
                tips={[
                  "Scan any URL from the Dashboard to detect issues",
                  "Violations are categorized by severity (critical, serious, moderate, minor)",
                  "Mark issues as fixed, in-progress, or won't-fix to track resolution",
                ]}
              />
            ) : (
              <div className="text-center py-16 px-4">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-neutral-600 dark:text-neutral-300 font-medium">
                  No violations in this category
                </p>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  {activeTab === "ALL" ? "This scan has no violations. Great job!" : "Try a different filter."}
                </p>
              </div>
            )
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data?.violations.map((violation) => (
                <div key={violation.id} className="flex items-start gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(violation.id)}
                    onChange={(e) => handleCheckbox(violation.id, e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300 dark:border-neutral-600 text-neutral-900 focus:ring-neutral-500"
                    aria-label={`Select violation: ${violation.help}`}
                  />
                  <div className="flex-1 min-w-0">
                    <EnhancedViolationCard
                      violation={violation}
                      onStatusChange={handleStatusChange}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              Page {data.page} of {data.totalPages} ({data.total} total)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="gap-1"
              >
                <ChevronLeft className="h-3 w-3" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={currentPage >= data.totalPages}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─────────────── Sub Components ───────────────

function SummaryCard({
  label,
  value,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
        active
          ? "border-neutral-900 dark:border-white bg-white dark:bg-neutral-900 ring-1 ring-neutral-900 dark:ring-white"
          : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-600"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
    </button>
  );
}
