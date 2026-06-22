"use client";

/**
 * RegLayer — Notifications Management Component
 *
 * WHY: Users configure when and how they receive alerts (email, in-app).
 * WHAT: Toggle notifications per event type (scan complete, score drop, new critical).
 * HOW: Fetches /api/notifications preferences, PATCH to update toggles.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";

interface NotificationPrefs {
  scanComplete: boolean;
  weeklyDigest: boolean;
  newViolations: boolean;
  complianceAlerts: boolean;
  teamActivity: boolean;
}

// Only toggles backed by a real delivery path are shown. Each maps to code that
// actually gates an email: scanComplete (scanService), newViolations/teamActivity
// (notification feed), complianceAlerts (scheduled-scan regression alerts),
// weeklyDigest (digest cron). "Scheduled Reports" was removed — nothing sent one.
const notificationSettings = [
  { key: "scanComplete" as const, label: "Scan Complete", description: "Get notified when a scan finishes running" },
  { key: "newViolations" as const, label: "New Violations Detected", description: "Alert when new accessibility issues are found" },
  { key: "complianceAlerts" as const, label: "Compliance Status Changes", description: "Notify when a scheduled scan detects a compliance regression" },
  { key: "weeklyDigest" as const, label: "Weekly Digest", description: "Summary of accessibility progress every Monday" },
  { key: "teamActivity" as const, label: "Team Activity", description: "When team members join, leave, or change roles" },
];

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    scanComplete: true,
    weeklyDigest: true,
    newViolations: true,
    complianceAlerts: true,
    teamActivity: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); })
      .then((d) => { if (d.preferences) setPrefs(d.preferences); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(key: keyof NotificationPrefs) {
    const previous = prefs;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: updated }) });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setPrefs(previous);           // revert the optimistic flip
      setSaveError("Couldn't save preferences. Please try again.");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {saved && (
        <p className="text-xs text-green-600 font-medium">✓ Preferences saved</p>
      )}
      {saveError && (
        <p className="text-xs text-red-600 font-medium" role="alert">{saveError}</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Email Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-neutral-500 text-center py-8">Loading preferences...</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {notificationSettings.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">{item.label}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">{item.description}</p>
                  </div>
                  <button
                    onClick={() => handleToggle(item.key)}
                    disabled={saving}
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      prefs[item.key] ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-neutral-900 transition-transform ${
                      prefs[item.key] ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Send Test Email</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Verify your email notifications are working</p>
              {testResult && (
                <p className={`text-xs mt-1 wrap-break-word ${testResult.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>{testResult}</p>
              )}
            </div>
            <button
              onClick={async () => {
                setTestSending(true);
                setTestResult(null);
                try {
                  const res = await fetch("/api/notifications", { method: "POST" });
                  const data = await res.json();
                  setTestResult(res.ok ? "✓ Test email sent!" : `✗ ${data.error || "Failed"}`);
                } catch { setTestResult("✗ Network error"); }
                finally { setTestSending(false); }
              }}
              disabled={testSending}
              className="shrink-0 rounded-lg bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors"
            >
              {testSending ? "Sending..." : "Send Test"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
