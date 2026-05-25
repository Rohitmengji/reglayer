"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Mail, CheckCircle2, AlertTriangle, BarChart3, Users, Calendar, Send } from "lucide-react";

interface NotificationPrefs {
  scanComplete: boolean;
  weeklyDigest: boolean;
  newViolations: boolean;
  complianceAlerts: boolean;
  teamActivity: boolean;
  scheduledReports: boolean;
}

const notificationSettings = [
  {
    key: "scanComplete" as const,
    label: "Scan Complete",
    description: "Get notified when a scan finishes running",
    icon: CheckCircle2,
  },
  {
    key: "newViolations" as const,
    label: "New Violations Detected",
    description: "Alert when new accessibility issues are found",
    icon: AlertTriangle,
  },
  {
    key: "complianceAlerts" as const,
    label: "Compliance Status Changes",
    description: "Notify when compliance level drops below threshold",
    icon: AlertTriangle,
  },
  {
    key: "weeklyDigest" as const,
    label: "Weekly Digest",
    description: "Summary of accessibility progress every Monday",
    icon: BarChart3,
  },
  {
    key: "teamActivity" as const,
    label: "Team Activity",
    description: "When team members join, leave, or change roles",
    icon: Users,
  },
  {
    key: "scheduledReports" as const,
    label: "Scheduled Reports",
    description: "Receive automated compliance reports on schedule",
    icon: Calendar,
  },
];

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    scanComplete: true,
    weeklyDigest: true,
    newViolations: true,
    complianceAlerts: true,
    teamActivity: false,
    scheduledReports: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => {
        if (d.preferences) setPrefs(d.preferences);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(key: keyof NotificationPrefs) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: updated }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Notifications</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Configure email alerts for accessibility events and compliance updates.
            </p>
          </div>
          {saved && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              Email Preferences
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-neutral-500 text-center py-8">Loading preferences...</p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {notificationSettings.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2">
                          <Icon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-white">{item.label}</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">{item.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggle(item.key)}
                        disabled={saving}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          prefs[item.key]
                            ? "bg-neutral-900 dark:bg-white"
                            : "bg-neutral-200 dark:bg-neutral-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-neutral-900 transition-transform ${
                            prefs[item.key] ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-neutral-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">GDPR Compliant</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Email notifications comply with EU data regulations. You can unsubscribe at any time.
                  Data is processed within the EU and not shared with third parties.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Email */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Send className="h-5 w-5 text-neutral-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Send Test Email</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Verify your email notifications are working correctly.
                  </p>
                  {testResult && (
                    <div className={`text-xs mt-2 p-2 rounded-md ${testResult.startsWith("✓") ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"}`}>
                      {testResult}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={async () => {
                  setTestSending(true);
                  setTestResult(null);
                  try {
                    const res = await fetch("/api/notifications", { method: "POST" });
                    const data = await res.json();
                    if (res.ok) {
                      setTestResult("✓ Test email sent! Check your inbox.");
                    } else {
                      setTestResult(`✗ ${data.error || "Failed to send"}`);
                    }
                  } catch {
                    setTestResult("✗ Network error");
                  } finally {
                    setTestSending(false);
                  }
                }}
                disabled={testSending}
                className="shrink-0 rounded-lg bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors"
              >
                {testSending ? "Sending..." : "Send Test"}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* SMTP Setup Guide */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-neutral-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">SMTP Configuration</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Add these environment variables to enable email notifications:
                </p>
                <pre className="mt-2 text-[11px] bg-neutral-100 dark:bg-neutral-800 rounded-md p-3 text-neutral-700 dark:text-neutral-300 overflow-x-auto">
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password`}
                </pre>
                <p className="text-[11px] text-neutral-400 mt-2">
                  For Gmail: Enable 2FA → Google Account → App Passwords → Generate one for &ldquo;Mail&rdquo;.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
