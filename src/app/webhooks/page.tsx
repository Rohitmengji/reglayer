"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Webhook,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Eye,
  EyeOff,
  Clock,
} from "lucide-react";

interface WebhookEntry {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  hasSecret: boolean;
  createdAt: string;
}

interface Delivery {
  id: string;
  webhookId: string;
  event: string;
  status: "success" | "failed";
  statusCode: number;
  duration: number;
  timestamp: string;
  error?: string;
}

const ALL_EVENTS = [
  { value: "scan.completed", label: "Scan Completed", description: "When any scan finishes successfully" },
  { value: "scan.failed", label: "Scan Failed", description: "When a scan errors out" },
  { value: "alert.triggered", label: "Alert Triggered", description: "When an alert rule fires" },
  { value: "score.improved", label: "Score Improved", description: "When score increases vs previous scan" },
  { value: "score.degraded", label: "Score Degraded", description: "When score decreases vs previous scan" },
  { value: "crawl.completed", label: "Crawl Completed", description: "When a site crawl finishes" },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["scan.completed", "alert.triggered"]);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Testing
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; status: string; statusCode: number } | null>(null);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  async function fetchWebhooks() {
    const res = await fetch("/api/webhooks");
    if (res.ok) {
      const data = await res.json();
      setWebhooks(data.webhooks || []);
      setDeliveries(data.deliveries || []);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, events: selectedEvents }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewSecret(data.signingSecret);
      setName("");
      setUrl("");
      setSelectedEvents(["scan.completed", "alert.triggered"]);
      setShowCreate(false);
      fetchWebhooks();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  async function handleTest(id: string) {
    setTesting(id);
    setTestResult(null);
    const res = await fetch("/api/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookId: id }),
    });
    if (res.ok) {
      const data = await res.json();
      setTestResult({ id, ...data });
      fetchWebhooks(); // refresh deliveries
    }
    setTesting(null);
  }

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Webhooks</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Receive real-time notifications when events happen in RegLayer.
            </p>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Endpoint
          </Button>
        </div>

        {/* Secret reveal (one-time) */}
        {newSecret && (
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-5">
            <h3 className="text-sm font-semibold text-green-800 mb-2">Signing Secret Created</h3>
            <p className="text-xs text-green-700 mb-3">
              Copy this secret now — it won&apos;t be shown again. Use it to verify webhook signatures.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-mono border border-green-200 dark:border-green-800">
                {showSecret ? newSecret : "•".repeat(40)}
              </code>
              <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(newSecret)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="mt-3 text-green-600" onClick={() => setNewSecret(null)}>
              Dismiss
            </Button>
          </div>
        )}

        {/* Create Form */}
        {showCreate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Register Webhook Endpoint</CardTitle>
              <CardDescription>
                We&apos;ll send a POST request with a JSON payload for each selected event.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Name</label>
                  <Input
                    placeholder="e.g. Slack Notifications"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Endpoint URL</label>
                  <Input
                    type="url"
                    placeholder="https://your-server.com/webhook"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-2 block">Events</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_EVENTS.map((ev) => (
                      <label
                        key={ev.value}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          selectedEvents.includes(ev.value)
                            ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950"
                            : "border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(ev.value)}
                          onChange={() => toggleEvent(ev.value)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{ev.label}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">{ev.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={creating || selectedEvents.length === 0}>
                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Webhook className="mr-2 h-4 w-4" />}
                    Create Webhook
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Registered Webhooks */}
        <div className="space-y-3">
          {webhooks.length === 0 && !showCreate && (
            <Card>
              <CardContent className="p-12 text-center">
                <Webhook className="h-12 w-12 text-neutral-200 mx-auto mb-4" />
                <p className="text-neutral-600 dark:text-neutral-300 font-medium">No webhooks configured</p>
                <p className="text-sm text-neutral-400 mt-1">
                  Add an endpoint to receive real-time event notifications.
                </p>
              </CardContent>
            </Card>
          )}

          {webhooks.map((hook) => (
            <Card key={hook.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-2 w-2 rounded-full ${hook.enabled ? "bg-green-500" : "bg-neutral-300"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">{hook.name}</p>
                      <p className="text-xs text-neutral-400 truncate">{hook.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Event badges */}
                    <div className="hidden md:flex gap-1">
                      {hook.events.map((ev) => (
                        <Badge key={ev} variant="secondary" className="text-[10px]">
                          {(ev as string).split(".")[1]}
                        </Badge>
                      ))}
                    </div>
                    {/* Test button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(hook.id)}
                      disabled={testing === hook.id}
                    >
                      {testing === hook.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {/* Delete */}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(hook.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
                {/* Test result inline */}
                {testResult && testResult.id === hook.id && (
                  <div className={`mt-3 rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                    testResult.status === "success" ? "bg-green-50 dark:bg-green-950 text-green-700" : "bg-red-50 dark:bg-red-950 text-red-700"
                  }`}>
                    {testResult.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    HTTP {testResult.statusCode} — {testResult.status}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Delivery Log */}
        {deliveries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent Deliveries</CardTitle>
              <CardDescription>Last {deliveries.length} webhook deliveries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-100 dark:border-neutral-700 p-3"
                  >
                    <div className="flex items-center gap-3">
                      {d.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">{d.event}</p>
                        {d.error && <p className="text-xs text-red-500">{d.error}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-400">
                      <span>HTTP {d.statusCode}</span>
                      <span>{d.duration}ms</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(d.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Payload Documentation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Payload Format</CardTitle>
            <CardDescription>Every delivery includes these headers and body structure</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">Headers</p>
                <pre className="rounded-lg bg-neutral-900 p-3 text-xs text-green-300 overflow-x-auto">
{`X-RegLayer-Event: scan.completed
X-RegLayer-Signature: sha256=<hmac_hex>
X-RegLayer-Delivery: <uuid>
Content-Type: application/json`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">Body</p>
                <pre className="rounded-lg bg-neutral-900 p-3 text-xs text-green-300 overflow-x-auto">
{`{
  "event": "scan.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "scanId": "clx...",
    "url": "https://example.com",
    "score": 85,
    "violations": 12,
    "critical": 2,
    "duration": 4500
  }
}`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-1">Verifying Signatures (Node.js)</p>
                <pre className="rounded-lg bg-neutral-900 p-3 text-xs text-green-300 overflow-x-auto">
{`const crypto = require('crypto');
const signature = req.headers['x-reglayer-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', YOUR_SECRET_HASH)
  .update(JSON.stringify(req.body))
  .digest('hex');
const valid = crypto.timingSafeEqual(
  Buffer.from(signature), Buffer.from(expected)
);`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
