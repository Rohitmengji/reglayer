"use client";

/**
 * RegLayer — Schedules Management Component
 *
 * WHY: Users manage recurring scan schedules (cron-based automation).
 * WHAT: CRUD interface for schedules: name, site, cron expression, enable/disable.
 * HOW: Fetches /api/schedules. Create/edit forms with cron builder helper.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, Play, Pause } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ModernSelect } from "@/components/ui/modern-select";

interface Schedule {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  site?: { url: string; name: string | null };
  lastScore?: number | null;
  lastViolations?: number | null;
  lastScanAt?: string | null;
}

function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, , , dow] = parts;

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const timeStr = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;

  if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
  if (dow === "*") return `Daily at ${timeStr}`;
  if (/^\d$/.test(dow)) return `Every ${dayNames[parseInt(dow)]} at ${timeStr}`;
  if (/^[\d,]+$/.test(dow)) {
    const days = dow.split(",").map((d) => dayNames[parseInt(d)]?.slice(0, 3)).join(", ");
    return `${days} at ${timeStr}`;
  }
  return cron;
}

function relativeTime(date: string | Date): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = target.getTime() - now.getTime();
  if (diffMs < 0) return "overdue";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

const CRON_PRESETS = [
  { label: "Daily at 9:00 AM", value: "0 9 * * *" },
  { label: "Every Monday at 9:00 AM", value: "0 9 * * 1" },
  { label: "Every weekday at 8:00 AM", value: "0 8 * * 1,2,3,4,5" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Twice daily (9am & 5pm)", value: "0 9,17 * * *" },
  { label: "Every Sunday at midnight", value: "0 0 * * 0" },
];

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const { t } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [customHour, setCustomHour] = useState("09");
  const [customMinute, setCustomMinute] = useState("00");
  const [customDays, setCustomDays] = useState<string[]>(["*"]);
  const [error, setError] = useState("");

  function buildCustomCron(hour: string, minute: string, days: string[]) {
    const dow = days.includes("*") ? "*" : days.join(",");
    return `${parseInt(minute)} ${parseInt(hour)} * * ${dow}`;
  }

  function toggleDay(day: string) {
    if (day === "*") {
      setCustomDays(["*"]);
      setCron(buildCustomCron(customHour, customMinute, ["*"]));
      return;
    }
    let newDays = customDays.filter((d) => d !== "*");
    if (newDays.includes(day)) {
      newDays = newDays.filter((d) => d !== day);
    } else {
      newDays.push(day);
    }
    if (newDays.length === 0) newDays = ["*"];
    setCustomDays(newDays);
    setCron(buildCustomCron(customHour, customMinute, newDays));
  }

  useEffect(() => {
    fetchSchedules();
  }, []);

  async function fetchSchedules() {
    const res = await fetch("/api/schedules");
    if (res.ok) {
      const data = await res.json();
      setSchedules(data.schedules);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, cron }),
      });
      if (res.ok) {
        setName("");
        setUrl("");
        setCron("0 9 * * *");
        setUseCustomCron(false);
        setShowForm(false);
        fetchSchedules();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create schedule");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(id: string) {
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id }),
    });
    fetchSchedules();
  }

  async function handleDelete(id: string) {
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchSchedules();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("settings.schedulesTitle")}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.schedulesSubtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-3 w-3" />
          New Schedule
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <Input placeholder="Schedule name (e.g., Production Homepage)" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
              <div>
                <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1 block">Frequency</label>
                <ModernSelect
                  options={[...CRON_PRESETS.map((p) => ({ value: p.value, label: p.label })), { value: "custom", label: "Custom cron expression" }]}
                  value={useCustomCron ? "custom" : cron}
                  onChange={(v) => {
                    if (v === "custom") {
                      setUseCustomCron(true);
                      setCustomHour("09");
                      setCustomMinute("00");
                      setCustomDays(["*"]);
                      setCron("0 9 * * *");
                    } else {
                      setUseCustomCron(false);
                      setCron(v);
                    }
                  }}
                />
                {useCustomCron && (
                  <div className="mt-3 space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-800/50">
                    <div>
                      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5 block">Time</label>
                      <div className="flex items-center gap-2">
                        <ModernSelect
                          options={Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, "0"), label: String(i).padStart(2, "0") }))}
                          value={customHour}
                          onChange={(v) => { setCustomHour(v); setCron(buildCustomCron(v, customMinute, customDays)); }}
                        />
                        <span className="text-sm font-medium text-neutral-500">:</span>
                        <ModernSelect
                          options={[{ value: "00", label: "00" }, { value: "15", label: "15" }, { value: "30", label: "30" }, { value: "45", label: "45" }]}
                          value={customMinute}
                          onChange={(v) => { setCustomMinute(v); setCron(buildCustomCron(customHour, v, customDays)); }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5 block">Days</label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "Every day", value: "*" },
                          { label: "Mon", value: "1" },
                          { label: "Tue", value: "2" },
                          { label: "Wed", value: "3" },
                          { label: "Thu", value: "4" },
                          { label: "Fri", value: "5" },
                          { label: "Sat", value: "6" },
                          { label: "Sun", value: "0" },
                        ].map((day) => (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => toggleDay(day.value)}
                            className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                              customDays.includes(day.value)
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-blue-400"
                            }`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Will scan: <strong className="text-neutral-700 dark:text-neutral-200">{cronToHuman(cron)}</strong>
                </p>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Creating..." : "Create Schedule"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setError(""); }}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 flex flex-col items-center justify-center text-center">
          <Clock className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">No schedules configured</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 max-w-sm">
            Set up automated monitoring to detect accessibility regressions after deploys.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{schedule.name}</p>
                    <Badge variant={schedule.enabled ? "success" : "secondary"}>
                      {schedule.enabled ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {schedule.site?.url || "—"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                      <Clock className="h-3 w-3" />
                      {cronToHuman(schedule.cron)}
                    </span>
                    {schedule.nextRunAt && schedule.enabled && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        Next run: <strong className="text-neutral-700 dark:text-neutral-200">{relativeTime(schedule.nextRunAt)}</strong>
                        <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                          ({new Date(schedule.nextRunAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {new Date(schedule.nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                        </span>
                      </span>
                    )}
                  </div>
                  {(schedule.lastRunAt || schedule.lastScore != null) && (
                    <div className="mt-2 flex items-center gap-3">
                      {schedule.lastRunAt && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          Last ran {relativeTime(new Date(Date.now() - (Date.now() - new Date(schedule.lastRunAt).getTime())))} — {new Date(schedule.lastRunAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {new Date(schedule.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {schedule.lastScore != null && (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          schedule.lastScore >= 90 ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                          schedule.lastScore >= 70 ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                          "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          Score: {schedule.lastScore}%
                        </span>
                      )}
                      {schedule.lastViolations != null && (
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          {schedule.lastViolations} violation{schedule.lastViolations !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <Button variant="ghost" size="icon" title={schedule.enabled ? "Pause" : "Resume"} onClick={() => handleToggle(schedule.id)}>
                    {schedule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(schedule.id)}>
                    <Trash2 className="h-4 w-4 text-neutral-500 dark:text-neutral-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
