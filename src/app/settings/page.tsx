"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, Play, Pause, Key, GitBranch, Bell, Copy, Eye, EyeOff } from "lucide-react";

interface Schedule {
  id: string;
  name: string;
  url: string;
  cron: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

type Tab = "general" | "api-keys" | "schedules" | "integrations" | "alerts";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: null },
    { id: "api-keys", label: "API Keys", icon: <Key className="h-3.5 w-3.5" /> },
    { id: "schedules", label: "Schedules", icon: <Clock className="h-3.5 w-3.5" /> },
    { id: "integrations", label: "Integrations", icon: <GitBranch className="h-3.5 w-3.5" /> },
    { id: "alerts", label: "Alerts", icon: <Bell className="h-3.5 w-3.5" /> },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Settings</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Manage API keys, integrations, schedules, and alerts.
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
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "schedules" && <SchedulesTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "alerts" && <AlertsTab />}
      </div>
    </AppShell>
  );
}

/* ─────────────── General Tab ─────────────── */
function GeneralTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Platform Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">Version</p>
              <p className="font-medium">0.2.0</p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">Engine</p>
              <p className="font-medium">Chromium + axe-core 4.x</p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">Database</p>
              <p className="font-medium">PostgreSQL (Neon)</p>
            </div>
            <div>
              <p className="text-neutral-500 dark:text-neutral-400">AI Model</p>
              <p className="font-medium">ChatGPT-5.4 Mini</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Endpoints</CardTitle>
          <CardDescription>Available API endpoints for integration</CardDescription>
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
            API Key Created — copy it now, you won&apos;t see it again!
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
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">API Keys</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Used for CI/CD gate and programmatic access</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-3 w-3" />
          Create Key
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
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No API keys yet.</p>
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
function SchedulesTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cron, setCron] = useState("0 9 * * 1");

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
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, cron }),
    });
    if (res.ok) {
      setName("");
      setUrl("");
      setCron("0 9 * * 1");
      setShowForm(false);
      fetchSchedules();
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
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Scheduled Scans</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Recurring accessibility monitoring</p>
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
              <Input placeholder="Schedule name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input type="url" placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
              <div>
                <Input placeholder="Cron expression" value={cron} onChange={(e) => setCron(e.target.value)} required />
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  0 9 * * 1 (Mon 9am) | 0 0 * * * (daily) | 0 */6 * * * (every 6h)
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">Create</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 text-center">
          <Clock className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">No schedules configured.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">{schedule.name}</p>
                  <Badge variant={schedule.enabled ? "success" : "secondary"}>
                    {schedule.enabled ? "Active" : "Paused"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {schedule.url} • <code className="text-neutral-600 dark:text-neutral-300">{schedule.cron}</code>
                </p>
                {schedule.nextRunAt && (
                  <p className="text-xs text-neutral-400">
                    Next: {new Date(schedule.nextRunAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => handleToggle(schedule.id)}>
                  {schedule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(schedule.id)}>
                  <Trash2 className="h-4 w-4 text-neutral-400" />
                </Button>
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
          <CardTitle className="text-sm">Create Alert Rule</CardTitle>
          <CardDescription>Get notified when accessibility degrades</CardDescription>
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
