"use client";

/**
 * RegLayer — Monitoring Configuration Page
 *
 * WHY: Users need a UI to configure automated recurring scans.
 *      Backend supports it (/api/schedules) but no settings page existed.
 *
 * WHAT: Create/manage scheduled scans with:
 *   - URL to scan
 *   - Cron frequency (hourly, daily, weekly, monthly)
 *   - Enable/disable toggle
 *   - View last execution results
 *
 * HOW: CRUD via /api/schedules endpoint. Cron execution by Vercel Cron (/api/cron/run-schedules).
 */

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/i18n-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoading } from "@/components/ui/page-loading";
import {
  Clock,
  Plus,
  Trash2,
  Globe,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Timer,
  Activity,
} from "lucide-react";

interface Schedule {
  id: string;
  name: string;
  url: string;
  cron: string;
  enabled: boolean;
  createdAt: string;
  nextRunAt: string | null;
  lastScore: number | null;
  lastViolations: number | null;
  lastScanAt: string | null;
}

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *", description: "Runs at the top of every hour" },
  { label: "Every 6 hours", value: "0 */6 * * *", description: "4 times a day" },
  { label: "Daily (9 AM)", value: "0 9 * * *", description: "Every day at 9:00 AM UTC" },
  { label: "Weekly (Mon)", value: "0 9 * * 1", description: "Every Monday at 9:00 AM UTC" },
  { label: "Monthly (1st)", value: "0 9 1 * *", description: "First of each month at 9:00 AM UTC" },
];

export default function MonitoringPage() {
  const { t } = useI18n();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formCron, setFormCron] = useState("0 9 * * *");

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch {
      setError("Failed to load monitoring schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern requires setState
    void fetchSchedules();
  }, [fetchSchedules]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, url: formUrl, cron: formCron }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create schedule");
      }
      setFormName("");
      setFormUrl("");
      setFormCron("0 9 * * *");
      setShowCreate(false);
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id }),
      });
      if (res.ok) fetchSchedules();
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this monitoring schedule?")) return;
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) fetchSchedules();
    } catch {}
  }

  function cronToHuman(cron: string): string {
    const preset = CRON_PRESETS.find((p) => p.value === cron);
    if (preset) return preset.label;
    return cron;
  }

  if (loading) {
    return (
      <AppShell>
        <PageLoading message="Loading your monitors..." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("nav.notifications")}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Schedule automated accessibility scans for your websites
            </p>
          </div>
          {schedules.length > 0 && (
            <Button
              onClick={() => setShowCreate(true)}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Schedule
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Something went wrong. Please try again.
          </div>
        )}

        {/* Create Schedule Form */}
        {showCreate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                New Monitoring Schedule
              </CardTitle>
              <CardDescription>
                Set up an automated recurring scan. We&apos;ll monitor the URL on your chosen frequency.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4 max-w-lg">
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">
                    Schedule Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g., Production Homepage"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">
                    URL to Monitor
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                    <Input
                      type="url"
                      placeholder="https://example.com"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 block">
                    Scan Frequency
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CRON_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setFormCron(preset.value)}
                        className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                          formCron === preset.value
                            ? "border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700"
                            : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
                        }`}
                      >
                        <p className={`text-xs font-medium ${
                          formCron === preset.value
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-neutral-700 dark:text-neutral-300"
                        }`}>
                          {preset.label}
                        </p>
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">{preset.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button type="submit" size="sm" disabled={creating} className="gap-2">
                    {creating ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        Create Schedule
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Schedule List */}
        {schedules.length === 0 && !showCreate ? (
          <EmptyState
            icon={Clock}
            iconColor="text-blue-400"
            title="No monitoring set up yet"
            description="Schedule automated scans to continuously track your website's accessibility score. Get alerted when issues arise."
            actionLabel="Create First Schedule"
            onAction={() => setShowCreate(true)}
            tips={[
              "Monitor your production URLs on a daily or weekly basis",
              "Get instant alerts when accessibility scores drop",
              "Track trends over time to prevent regressions",
              "Pair with CI/CD for pre-deploy accessibility gates",
            ]}
          />
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <Card key={schedule.id} className={!schedule.enabled ? "opacity-60" : ""}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Status Icon */}
                      <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${
                        schedule.enabled
                          ? "bg-emerald-100 dark:bg-emerald-900/30"
                          : "bg-neutral-100 dark:bg-neutral-800"
                      }`}>
                        {schedule.enabled ? (
                          <PlayCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <PauseCircle className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                            {schedule.name}
                          </h3>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {cronToHuman(schedule.cron)}
                          </Badge>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                          {schedule.url}
                        </p>

                        {/* Last Scan Results */}
                        <div className="flex items-center gap-4 mt-2">
                          {schedule.lastScore !== null ? (
                            <>
                              <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                                <Activity className="h-3 w-3" />
                                Score: <strong className={schedule.lastScore >= 80 ? "text-emerald-600" : schedule.lastScore >= 60 ? "text-amber-600" : "text-red-600"}>{schedule.lastScore}</strong>
                              </span>
                              <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                                <AlertTriangle className="h-3 w-3" />
                                {schedule.lastViolations} violations
                              </span>
                              <span className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                                <Calendar className="h-3 w-3" />
                                {schedule.lastScanAt ? new Date(schedule.lastScanAt).toLocaleDateString() : "—"}
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              Awaiting first scan
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggle(schedule.id)}
                        className={`p-2 rounded-md transition-colors ${
                          schedule.enabled
                            ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        }`}
                        title={schedule.enabled ? "Pause" : "Resume"}
                      >
                        {schedule.enabled ? (
                          <PauseCircle className="h-4 w-4" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id)}
                        className="p-2 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info Card */}
        {schedules.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
                  <p>Scans run automatically based on your schedule. Results appear in your scan history.</p>
                  <p>Configure alerts in <a href="/settings?tab=alerts" className="text-blue-500 hover:underline">Settings → Alerts</a> to get notified when scores drop.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
