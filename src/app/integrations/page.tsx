"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Plug, CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

interface ConnectedIntegration {
  id: string;
  provider: string;
  name: string | null;
  enabled: boolean;
  webhookUrl: string | null;
  config: Record<string, unknown> | null;
  connectedAt: string;
}

const integrationDefs: IntegrationDef[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Get real-time scan notifications and compliance alerts in your Slack channels.",
    icon: "💬",
    category: "Communication",
    fields: [
      { key: "webhookUrl", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/T.../B.../xxx" },
    ],
  },
  {
    id: "jira",
    name: "Jira",
    description: "Create Jira tickets from accessibility violations automatically. Map severity to priority.",
    icon: "🎫",
    category: "Project Management",
    fields: [
      { key: "domain", label: "Jira Domain", placeholder: "your-org.atlassian.net" },
      { key: "projectKey", label: "Project Key", placeholder: "ACC" },
      { key: "accessToken", label: "API Token", placeholder: "Your Jira API token", type: "password" },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Create GitHub Issues from violations and add accessibility checks to pull requests.",
    icon: "🐙",
    category: "Development",
    fields: [
      { key: "owner", label: "Repository Owner", placeholder: "your-org" },
      { key: "repo", label: "Repository Name", placeholder: "your-website" },
      { key: "accessToken", label: "Personal Access Token", placeholder: "ghp_...", type: "password" },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description: "Sync violations to Linear issues with automatic priority mapping and labels.",
    icon: "📐",
    category: "Project Management",
    fields: [
      { key: "accessToken", label: "API Key", placeholder: "lin_api_...", type: "password" },
      { key: "teamId", label: "Team ID", placeholder: "Team identifier" },
    ],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Receive scan results and compliance updates in your Teams channels.",
    icon: "👥",
    category: "Communication",
    fields: [
      { key: "webhookUrl", label: "Incoming Webhook URL", placeholder: "https://outlook.office.com/webhook/..." },
    ],
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Create GitLab issues and integrate accessibility checks into CI/CD pipelines.",
    icon: "🦊",
    category: "Development",
    fields: [
      { key: "domain", label: "GitLab Domain", placeholder: "gitlab.com or self-hosted" },
      { key: "projectId", label: "Project ID", placeholder: "12345" },
      { key: "accessToken", label: "Access Token", placeholder: "glpat-...", type: "password" },
    ],
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect RegLayer to 5,000+ apps with custom automation workflows.",
    icon: "⚡",
    category: "Automation",
    fields: [
      { key: "webhookUrl", label: "Zapier Webhook URL", placeholder: "https://hooks.zapier.com/hooks/catch/..." },
    ],
  },
  {
    id: "email",
    name: "Email (SMTP)",
    description: "Send compliance reports via your own SMTP server.",
    icon: "📧",
    category: "Communication",
    fields: [
      { key: "host", label: "SMTP Host", placeholder: "smtp.company.com" },
      { key: "port", label: "Port", placeholder: "587" },
      { key: "user", label: "Username", placeholder: "notifications@company.com" },
      { key: "pass", label: "Password", placeholder: "••••••••", type: "password" },
    ],
  },
];

export default function IntegrationsPage() {
  const [connected, setConnected] = useState<ConnectedIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    fetchIntegrations();
  }, []);

  async function fetchIntegrations() {
    try {
      const res = await fetch("/api/integrations");
      if (!res.ok) return;
      const data = await res.json();
      setConnected(data.integrations || []);
    } catch {
      // Network error or invalid JSON
    } finally {
      setLoading(false);
    }
  }

  function isConnected(provider: string) {
    return connected.some((c) => c.provider === provider && c.enabled);
  }

  function getConnection(provider: string) {
    return connected.find((c) => c.provider === provider);
  }

  async function handleConnect(def: IntegrationDef) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      // Build the payload based on the provider
      const payload: Record<string, unknown> = { provider: def.id };

      if (formData.webhookUrl) {
        payload.webhookUrl = formData.webhookUrl;
      }
      if (formData.accessToken) {
        payload.accessToken = formData.accessToken;
      }

      // Config fields (everything except webhookUrl and accessToken)
      const configFields: Record<string, string> = {};
      for (const field of def.fields) {
        if (field.key !== "webhookUrl" && field.key !== "accessToken" && formData[field.key]) {
          configFields[field.key] = formData[field.key];
        }
      }
      if (Object.keys(configFields).length > 0) {
        payload.config = configFields;
      }

      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        setError("Server error. Check your connection and try again.");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Connection failed");
        return;
      }

      setSuccess(`${def.name} connected successfully!`);
      setConfiguring(null);
      setFormData({});
      await fetchIntegrations();
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(provider: string) {
    const connection = getConnection(provider);
    if (!connection) return;
    if (!confirm(`Disconnect ${provider}? You'll stop receiving notifications through this integration.`)) return;

    await fetch(`/api/integrations?id=${connection.id}`, { method: "DELETE" });
    await fetchIntegrations();
  }

  const categories = [...new Set(integrationDefs.map((d) => d.category))];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("integrations.title")}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {t("integrations.subtitle")}
            </p>
          </div>
          {success && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {success}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500 text-center py-8">Loading integrations...</p>
        ) : (
          <>
            {categories.map((category) => (
              <div key={category}>
                <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {integrationDefs
                    .filter((d) => d.category === category)
                    .map((def) => {
                      const isActive = isConnected(def.id);
                      const isOpen = configuring === def.id;

                      return (
                        <Card key={def.id} className={isActive ? "ring-1 ring-green-200 dark:ring-green-900" : ""}>
                          <CardContent className="py-5">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <span className="text-2xl">{def.icon}</span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-semibold text-neutral-900 dark:text-white">{def.name}</h3>
                                    {isActive && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                                  </div>
                                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                                    {def.description}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Configuration Form */}
                            {isOpen && (
                              <div className="mt-4 border-t border-neutral-100 dark:border-neutral-800 pt-4 space-y-3">
                                {def.fields.map((field) => (
                                  <div key={field.key}>
                                    <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1 block">
                                      {field.label}
                                    </label>
                                    <input
                                      type={field.type || "text"}
                                      placeholder={field.placeholder}
                                      value={formData[field.key] || ""}
                                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
                                    />
                                  </div>
                                ))}
                                {error && configuring === def.id && (
                                  <p className="text-xs text-red-600 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" /> {error}
                                  </p>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleConnect(def)}
                                    disabled={saving}
                                    className="rounded-lg bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors"
                                  >
                                    {saving ? "Connecting..." : "Connect"}
                                  </button>
                                  <button
                                    onClick={() => { setConfiguring(null); setFormData({}); setError(""); }}
                                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            {!isOpen && (
                              <div className="mt-4 flex items-center gap-2">
                                {isActive ? (
                                  <button
                                    onClick={() => handleDisconnect(def.id)}
                                    className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 transition-colors"
                                  >
                                    Disconnect
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => { setConfiguring(def.id); setFormData({}); setError(""); }}
                                    className="rounded-lg px-3 py-1.5 text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors"
                                  >
                                    Configure
                                  </button>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              </div>
            ))}
          </>
        )}

        {/* API Card */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Plug className="h-5 w-5 text-neutral-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Custom Integrations via API</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Use the REST API and Webhooks to build custom integrations. All events are dispatched to connected services automatically when scans complete.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
