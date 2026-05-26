"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, Play, Pause, Key, GitBranch, Bell, Copy, Eye, EyeOff, Sparkles, Zap } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

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

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

type Tab = "plan" | "general" | "api-keys" | "schedules" | "integrations" | "alerts";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const { t } = useI18n();

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "plan", label: t("settings.tabPlan"), icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "general", label: t("settings.tabGeneral"), icon: null },
    { id: "api-keys", label: t("settings.tabApiKeys"), icon: <Key className="h-3.5 w-3.5" /> },
    { id: "schedules", label: t("settings.tabSchedules"), icon: <Clock className="h-3.5 w-3.5" /> },
    { id: "integrations", label: t("settings.tabIntegrations"), icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: "alerts", label: t("settings.tabAlerts"), icon: <Bell className="h-3.5 w-3.5" /> },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("settings.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("settings.subtitle")}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-700 pb-px -mx-4 px-4 sm:mx-0 sm:px-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-neutral-900 text-neutral-900 dark:text-white"
                  : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:text-neutral-200"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "plan" && <PlanUsageTab />}
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "schedules" && <SchedulesTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "alerts" && <AlertsTab />}
      </div>
    </AppShell>
  );
}

/* ─────────────── Plan & Usage Tab ─────────────── */
function PlanUsageTab() {
  const [data, setData] = useState<{
    plan: string;
    credits: { used: number; limit: number; remaining: number; daysUntilReset: number; unlimited: boolean };
    limits: { scansPerMonth: number; pagesPerScan: number; teamMembers: number; auditLogDays: number };
    features: Record<string, boolean | string | number>;
    costs: Record<string, number>;
  } | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);

  if (!data) {
    return <div className="text-center py-8 text-sm text-neutral-500">{t("common.loading")}</div>;
  }

  const planLabels: Record<string, string> = { FREE: "Free", PRO: "Pro", ENTERPRISE: "Enterprise" };
  const planColors: Record<string, string> = {
    FREE: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    PRO: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
    ENTERPRISE: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
  };

  const creditPercent = data.credits.unlimited ? 0 : Math.min(100, (data.credits.used / data.credits.limit) * 100);

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{t("settings.currentPlan")}</CardTitle>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${planColors[data.plan]}`}>
              {planLabels[data.plan] || data.plan}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.aiCredits")}</p>
              <p className="text-lg font-bold text-neutral-900 dark:text-white">
                {data.credits.unlimited ? "∞" : `${data.credits.remaining}/${data.credits.limit}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.scansPerMonth")}</p>
              <p className="text-lg font-bold text-neutral-900 dark:text-white">
                {data.limits.scansPerMonth === -1 ? "∞" : data.limits.scansPerMonth}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.pagesPerScan")}</p>
              <p className="text-lg font-bold text-neutral-900 dark:text-white">
                {data.limits.pagesPerScan === -1 ? "∞" : data.limits.pagesPerScan}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.teamMembers")}</p>
              <p className="text-lg font-bold text-neutral-900 dark:text-white">
                {data.limits.teamMembers === -1 ? "∞" : data.limits.teamMembers}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Credits Usage */}
      {!data.credits.unlimited && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" /> {t("settings.aiCreditsUsage")}
              </CardTitle>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("settings.resetsIn", { days: String(data.credits.daysUntilReset) })}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600 dark:text-neutral-300">{t("settings.creditsUsed", { used: String(data.credits.used) })}</span>
                <span className="text-neutral-600 dark:text-neutral-300">{t("settings.remaining", { remaining: String(data.credits.remaining) })}</span>
              </div>
              <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.credits.remaining <= 5 ? "bg-red-500" :
                    creditPercent > 80 ? "bg-amber-500" : "bg-violet-500"
                  }`}
                  style={{ width: `${creditPercent}%` }}
                />
              </div>
              {data.credits.remaining <= 5 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Zap className="h-3 w-3" />
                  <span>{t("settings.creditsLow")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Costs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.creditCosts")}</CardTitle>
          <CardDescription>{t("settings.creditCostsSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(data.costs).map(([action, cost]) => (
              <div key={action} className="flex items-center justify-between rounded-lg border border-neutral-100 dark:border-neutral-800 p-3">
                <span className="text-sm text-neutral-700 dark:text-neutral-300 capitalize">
                  {action.replace(/([A-Z])/g, " $1").trim()}
                </span>
                <Badge variant="secondary" className="text-xs">{cost} credit{cost !== 1 ? "s" : ""}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.planFeatures")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: "AI Explanations", key: "aiExplanations" },
              { label: "AI Fix Suggestions", key: "aiFixSuggestions" },
              { label: "AI Insights", key: "aiInsights" },
              { label: "Compliance Reports", key: "complianceReports" },
              { label: "Scheduled Scans", key: "scheduledScans" },
              { label: "Webhooks", key: "webhooks" },
            ].map((f) => {
              const val = data.features[f.key];
              const available = val === true || val === "full" || (typeof val === "number" && val > 0);
              return (
                <div key={f.key} className="flex items-center justify-between rounded-lg p-2">
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">{f.label}</span>
                  {available ? (
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                      {val === true || val === "full" ? "✓ Included" : typeof val === "number" ? `${val === -1 ? "∞" : val}` : String(val)}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-neutral-400">
                      {val === "basic" || val === "summary" ? `${String(val)} only` : "✗ Not included"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-4">
            Audit log retention: {data.limits.auditLogDays} days
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────── General Tab ─────────────── */
function GeneralTab() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.platformInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">{t("settings.version")}</p>
              <p className="font-medium">0.2.0</p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">{t("settings.engine")}</p>
              <p className="font-medium">Chromium + axe-core 4.x</p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">{t("settings.database")}</p>
              <p className="font-medium">PostgreSQL (Neon)</p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">{t("settings.aiModel")}</p>
              <p className="font-medium">ChatGPT-5.4 Mini</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.endpoints")}</CardTitle>
          <CardDescription>{t("settings.endpointsSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs font-mono">
            {[
              "POST /api/scan",
              "POST /api/crawl",
              "POST /api/gate",
              "GET  /api/scans",
              "GET  /api/scans/:id",
              "GET  /api/scans/:id/priorities",
              "GET  /api/scans/compare?base=&head=",
              "GET  /api/analytics",
              "GET  /api/badge?url=",
              "POST /api/monitors",
              "POST /api/integrations/github/issues",
              "GET  /api/integrations/github/action",
            ].map((ep) => (
              <div key={ep} className="rounded bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-neutral-700 dark:text-neutral-200">
                {ep}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────── API Keys Tab ─────────────── */
function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    const res = await fetch("/api/keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys || []);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: keyName }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewKey(data.key);
      setKeyName("");
      setShowCreate(false);
      fetchKeys();
    }
  }

  async function handleRevoke(id: string) {
    await fetch("/api/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchKeys();
  }

  return (
    <div className="space-y-6">
      {/* New key reveal */}
      {newKey && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
          <p className="text-sm font-medium text-green-800 mb-2">
            {t("settings.newKeyMessage")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white border border-green-200 dark:border-green-800 font-mono">
              {showKey ? newKey : "••••••••••••••••••••••••••••••••"}
            </code>
            <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigator.clipboard.writeText(newKey)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNewKey(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("settings.apiKeysTitle")}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("settings.apiKeysSubtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-3 w-3" />
          {t("settings.createKey")}
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <Input
            placeholder="Key name (e.g. GitHub Actions)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            required
            className="flex-1"
          />
          <Button type="submit" size="sm">Generate</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
        </form>
      )}

      {keys.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 text-center">
          <Key className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("settings.noApiKeys")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">{key.name}</p>
                  <code className="text-xs text-neutral-400">{key.prefix}••••••••</code>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Created {new Date(key.createdAt).toLocaleDateString()}
                  {key.lastUsedAt && ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleRevoke(key.id)}>
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Schedules Tab ─────────────── */

/** Convert cron expression to human-readable text */
function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, , , dow] = parts;

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const timeStr = `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;

  // Every X hours
  if (hour.startsWith("*/")) return `Every ${hour.slice(2)} hours`;
  // Every day at specific time
  if (dow === "*") return `Daily at ${timeStr}`;
  // Specific day of week
  if (/^\d$/.test(dow)) return `Every ${dayNames[parseInt(dow)]} at ${timeStr}`;
  // Comma-separated days
  if (/^[\d,]+$/.test(dow)) {
    const days = dow.split(",").map((d) => dayNames[parseInt(d)]?.slice(0, 3)).join(", ");
    return `${days} at ${timeStr}`;
  }
  return cron;
}

/** Format relative time (e.g., "in 2 days", "in 5 hours") */
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

/** Preset cron options for the dropdown */
const CRON_PRESETS = [
  { label: "Daily at 9:00 AM", value: "0 9 * * *" },
  { label: "Every Monday at 9:00 AM", value: "0 9 * * 1" },
  { label: "Every weekday at 8:00 AM", value: "0 8 * * 1,2,3,4,5" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Twice daily (9am & 5pm)", value: "0 9,17 * * *" },
  { label: "Every Sunday at midnight", value: "0 0 * * 0" },
];

function SchedulesTab() {
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

  // Build cron from custom picker
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
                <select
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white"
                  value={useCustomCron ? "custom" : cron}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setUseCustomCron(true);
                      setCustomHour("09");
                      setCustomMinute("00");
                      setCustomDays(["*"]);
                      setCron("0 9 * * *");
                    } else {
                      setUseCustomCron(false);
                      setCron(e.target.value);
                    }
                  }}
                >
                  {CRON_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                  <option value="custom">Custom cron expression</option>
                </select>
                {useCustomCron && (
                  <div className="mt-3 space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50 dark:bg-neutral-800/50">
                    <div>
                      <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1.5 block">Time</label>
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm text-neutral-900 dark:text-white"
                          value={customHour}
                          onChange={(e) => { setCustomHour(e.target.value); setCron(buildCustomCron(e.target.value, customMinute, customDays)); }}
                        >
                          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="text-sm font-medium text-neutral-500">:</span>
                        <select
                          className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm text-neutral-900 dark:text-white"
                          value={customMinute}
                          onChange={(e) => { setCustomMinute(e.target.value); setCron(buildCustomCron(customHour, e.target.value, customDays)); }}
                        >
                          {["00", "15", "30", "45"].map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
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
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 text-center">
          <Clock className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-3 text-sm font-medium text-neutral-600 dark:text-neutral-300">No schedules configured</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Set up automated monitoring to detect accessibility regressions after deploys.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  {/* Header row */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{schedule.name}</p>
                    <Badge variant={schedule.enabled ? "success" : "secondary"}>
                      {schedule.enabled ? "Active" : "Paused"}
                    </Badge>
                  </div>

                  {/* URL */}
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {schedule.site?.url || "—"}
                  </p>

                  {/* Schedule info row */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
                      <Clock className="h-3 w-3" />
                      {cronToHuman(schedule.cron)}
                    </span>

                    {schedule.nextRunAt && schedule.enabled && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        Next run: <strong className="text-neutral-700 dark:text-neutral-200">{relativeTime(schedule.nextRunAt)}</strong>
                        <span className="ml-1 text-neutral-400">
                          ({new Date(schedule.nextRunAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {new Date(schedule.nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Last run + score info */}
                  {(schedule.lastRunAt || schedule.lastScore != null) && (
                    <div className="mt-2 flex items-center gap-3">
                      {schedule.lastRunAt && (
                        <span className="text-xs text-neutral-400">
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
                        <span className="text-xs text-neutral-400">
                          {schedule.lastViolations} violation{schedule.lastViolations !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  <Button variant="ghost" size="icon" title={schedule.enabled ? "Pause" : "Resume"} onClick={() => handleToggle(schedule.id)}>
                    {schedule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(schedule.id)}>
                    <Trash2 className="h-4 w-4 text-neutral-400 hover:text-red-500" />
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

/* ─────────────── Integrations Tab ─────────────── */
function IntegrationsTab() {
  const [ghOwner, setGhOwner] = useState("");
  const [ghRepo, setGhRepo] = useState("");
  const [ghToken, setGhToken] = useState("");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // Store in localStorage for now (production: encrypt and store in DB)
    localStorage.setItem("reglayer_github_config", JSON.stringify({ owner: ghOwner, repo: ghRepo, token: ghToken }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      const stored = localStorage.getItem("reglayer_github_config");
      if (stored) {
        const config = JSON.parse(stored);
        setGhOwner(config.owner || "");
        setGhRepo(config.repo || "");
        setGhToken(config.token || "");
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6">
      {/* GitHub */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            <CardTitle className="text-sm">GitHub</CardTitle>
          </div>
          <CardDescription>Auto-create issues from violations and run CI checks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Repository Owner (e.g. octocat)" value={ghOwner} onChange={(e) => setGhOwner(e.target.value)} />
          <Input placeholder="Repository Name (e.g. my-site)" value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} />
          <Input type="password" placeholder="Personal Access Token (repo scope)" value={ghToken} onChange={(e) => setGhToken(e.target.value)} />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave}>Save</Button>
            {saved && <span className="text-xs text-green-600">Saved!</span>}
          </div>
          <div className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
            <p className="font-medium">After configuring:</p>
            <p>• Go to any scan report → click &quot;Create GitHub Issue&quot;</p>
            <p>• Download GitHub Action: <code className="bg-white dark:bg-neutral-900 px-1 rounded">/api/integrations/github/action</code></p>
          </div>
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle className="text-sm">Webhooks</CardTitle>
          </div>
          <CardDescription>Receive notifications when scans complete or alerts trigger</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
            <p className="font-medium">Webhook Events:</p>
            <p>• <code>scan.completed</code> — fires after every scan</p>
            <p>• <code>alert.triggered</code> — fires when alert condition met</p>
            <p>• <code>score.dropped</code> — fires on regression</p>
            <p className="mt-2">Configure via API: <code>POST /api/monitors</code></p>
          </div>
        </CardContent>
      </Card>

      {/* Badge */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Embed Badge</CardTitle>
          <CardDescription>Show your accessibility score in READMEs</CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 text-xs text-neutral-700 dark:text-neutral-200 break-all">
            ![Accessibility](https://reglayer.vercel.app/api/badge?url=YOUR_URL)
          </code>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────── Alerts Tab ─────────────── */
function AlertsTab() {
  const [url, setUrl] = useState("");
  const [condition, setCondition] = useState("score_below");
  const [threshold, setThreshold] = useState("80");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [created, setCreated] = useState(false);
  const { t } = useI18n();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/monitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Alert: ${condition} ${threshold}`,
        url,
        condition,
        threshold: Number(threshold),
        notifyVia: webhookUrl ? "webhook" : "email",
        webhookUrl: webhookUrl || undefined,
      }),
    });
    if (res.ok) {
      setCreated(true);
      setUrl("");
      setWebhookUrl("");
      setTimeout(() => setCreated(false), 3000);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.createAlert")}</CardTitle>
          <CardDescription>{t("settings.alertsSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input type="url" placeholder="URL to monitor" value={url} onChange={(e) => setUrl(e.target.value)} required />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm bg-white dark:bg-neutral-900"
              >
                <option value="score_below">Score drops below</option>
                <option value="score_drop">Score drops by</option>
                <option value="new_critical">Critical violations exceed</option>
                <option value="new_violations">Total violations exceed</option>
              </select>
              <Input type="number" placeholder="Threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
            </div>
            <Input type="url" placeholder="Webhook URL (optional)" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">Create Alert</Button>
              {created && <span className="text-xs text-green-600">Alert created!</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Alerts Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-600 dark:text-neutral-300 space-y-2">
          <p>After every scan, RegLayer evaluates all your alert rules:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>Score Below</strong> — triggers if score falls below threshold</li>
            <li><strong>Score Drop</strong> — triggers if score decreased by N points vs previous</li>
            <li><strong>Critical Violations</strong> — triggers if critical count exceeds threshold</li>
            <li><strong>Total Violations</strong> — triggers if violation count exceeds threshold</li>
          </ul>
          <p className="text-xs text-neutral-400 mt-3">
            All triggers are logged in the audit trail and dispatched via webhook.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
