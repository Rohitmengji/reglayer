"use client";

/**
 * RegLayer — Settings Page
 *
 * WHY: Users need to manage their account: API keys, profile, password, preferences.
 * WHAT: Tabbed settings: Profile, API Keys (create/revoke), Password change, Notification prefs.
 * HOW: Fetches /api/keys for key list, /api/auth/change-password for password updates. CRUD operations.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ModernSelect } from "@/components/ui/modern-select";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/page-loading";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Key, GitBranch, Bell, Copy, Eye, EyeOff, Sparkles, Zap, SlidersHorizontal, AlertTriangle, User, Download, Pencil, X, Shield, Brain } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { signOutAndClear } from "@/lib/auth/sign-out";
import Link from "next/link";
import { useFeatures } from "@/hooks/use-features";
import { useSession } from "next-auth/react";
import { DecisionEngineTab } from "@/components/settings/decision-engine-tab";

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

type Tab = "plan" | "general" | "account" | "api-keys" | "integrations" | "alerts" | "decisions";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get("tab") as Tab) || "plan");
  const { t } = useI18n();
  const { hasFeature } = useFeatures();
  const { data: session } = useSession();
  const userRole = session?.user?.workspaceRole;
  const isMasterAdmin = session?.user?.isMasterAdmin;
  const canManageSso = isMasterAdmin || userRole === "OWNER" || userRole === "ADMIN";

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "plan", label: t("settings.tabPlan"), icon: <Sparkles className="h-4 w-4" /> },
    { id: "account", label: "Account", icon: <User className="h-4 w-4" /> },
    { id: "general", label: t("settings.tabGeneral"), icon: <SlidersHorizontal className="h-4 w-4" /> },
    { id: "api-keys", label: t("settings.tabApiKeys"), icon: <Key className="h-4 w-4" /> },
    { id: "integrations", label: t("settings.tabIntegrations"), icon: <GitBranch className="h-4 w-4" /> },
    { id: "alerts", label: t("settings.tabAlerts"), icon: <AlertTriangle className="h-4 w-4" /> },
    { id: "decisions", label: "AI Decisions", icon: <Brain className="h-4 w-4" /> },
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
        <div className="grid grid-cols-3 sm:flex sm:gap-1 border-b border-neutral-200 dark:border-neutral-700 pb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center sm:justify-start gap-2 px-2 py-3 sm:px-4 sm:py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? "text-neutral-900 dark:text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-neutral-900 after:dark:bg-white after:rounded-full"
                  : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white"
              }`}
              title={tab.label}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
          {hasFeature("sso") && canManageSso && (
            <Link
              href="/settings/sso"
              className="flex items-center justify-center sm:justify-start gap-2 px-2 py-3 sm:px-4 sm:py-2.5 text-sm font-medium transition-colors text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">SSO</span>
            </Link>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === "plan" && <PlanUsageTab />}
        {activeTab === "account" && <AccountTab />}
        {activeTab === "general" && <GeneralTab />}
        {activeTab === "api-keys" && <ApiKeysTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "alerts" && <AlertsTab />}
        {activeTab === "decisions" && <DecisionEngineTab />}
      </div>
    </AppShell>
  );
}

/* ─────────────── Plan & Usage Tab ─────────────── */
function PlanUsageTab() {
  const [data, setData] = useState<{
    plan: string;
    credits: { used: number; limit: number; totalAvailable: number; remaining: number; daysUntilReset: number; unlimited: boolean };
    limits: { scansPerMonth: number; pagesPerScan: number; teamMembers: number; auditLogDays: number };
    features: Record<string, boolean | string | number>;
    costs: Record<string, number>;
  } | null>(null);
  const { t } = useI18n();
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Start a Stripe Checkout upgrade. The route returns { url } on success, or 503
  // when billing isn't configured — surface that honestly instead of a dead button.
  const startCheckout = async (plan: "PRO" | "ENTERPRISE") => {
    setBillingBusy(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval: "monthly" }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setBillingError("Billing isn't configured yet — please contact support to upgrade.");
        return;
      }
      if (!res.ok || !body.url) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not start checkout");
      }
      window.location.href = body.url;
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setBillingBusy(false);
    }
  };

  // Open the Stripe billing portal (manage/cancel subscription).
  const openBillingPortal = async () => {
    setBillingBusy(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setBillingError("Billing isn't configured yet — please contact support.");
        return;
      }
      if (!res.ok || !body.url) {
        throw new Error(typeof body.error === "string" ? body.error : "Could not open billing portal");
      }
      window.location.href = body.url;
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Could not open billing portal");
    } finally {
      setBillingBusy(false);
    }
  };

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

  const creditPercent = data.credits.unlimited ? 0 : Math.min(100, (data.credits.used / data.credits.totalAvailable) * 100);

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
                {data.credits.unlimited ? "∞" : `${data.credits.remaining}/${data.credits.totalAvailable}`}
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {data.plan === "FREE" && (
              <button
                onClick={() => startCheckout("PRO")}
                disabled={billingBusy}
                className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
              >
                {billingBusy ? "…" : "Upgrade to Pro"}
              </button>
            )}
            {data.plan === "PRO" && (
              <>
                <button
                  onClick={() => startCheckout("ENTERPRISE")}
                  disabled={billingBusy}
                  className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  {billingBusy ? "…" : "Upgrade to Enterprise"}
                </button>
                <button
                  onClick={openBillingPortal}
                  disabled={billingBusy}
                  className="inline-flex items-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Manage billing
                </button>
              </>
            )}
            {data.plan === "ENTERPRISE" && (
              <button
                onClick={openBillingPortal}
                disabled={billingBusy}
                className="inline-flex items-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Manage billing
              </button>
            )}
          </div>
          {billingError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{billingError}</p>
          )}
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
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {val === "basic" || val === "summary" ? `${String(val)} only` : "✗ Not included"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-4">
            Audit log retention: {data.limits.auditLogDays} days
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────── Account Tab ─────────────── */
function AccountTab() {
  const [profile, setProfile] = useState<{ id: string; email: string; name: string | null; image: string | null; plan: string; createdAt: string } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => {
        if (r.status === 401) { signOutAndClear({ callbackUrl: "/auth/login" }); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d?.user) {
          setProfile(d.user);
          setName(d.user.name || "");
          setEmail(d.user.email || "");
        }
      })
      .catch(() => {});
  }, []);

  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setProfileStatus(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, email: email.trim() || undefined }),
      });
      if (res.status === 401) {
        signOutAndClear({ callbackUrl: "/auth/login" });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user);
        setEditing(false);
        setProfileStatus({ type: "success", message: "Profile updated successfully" });
      } else {
        const data = await res.json();
        setProfileStatus({ type: "error", message: data.error || "Failed to update profile" });
      }
    } catch {
      setProfileStatus({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reglayer-data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export data. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "x-confirm-delete": "DELETE_MY_ACCOUNT" },
      });
      if (res.ok) {
        signOutAndClear({ callbackUrl: "/" });
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete account");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (!profile) {
    return <PageLoading message="Loading your profile..." />;
  }

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-blue-500" />
              Profile Information
            </CardTitle>
            <CardDescription>Update your name and email address.</CardDescription>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileUpdate} className="space-y-4 max-w-md">
            <div>
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">Display Name</label>
              <Input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                readOnly={!editing}
                className={!editing ? "bg-neutral-50 dark:bg-neutral-900 cursor-default" : ""}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1 block">Email Address</label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!editing}
                className={!editing ? "bg-neutral-50 dark:bg-neutral-900 cursor-default" : ""}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Member since {new Date(profile.createdAt).toLocaleDateString()}
              </span>
              <Badge variant="secondary" className="text-[10px]">{profile.plan}</Badge>
            </div>
            {profileStatus && (
              <p className={`text-xs ${profileStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {profileStatus.message}
              </p>
            )}
            {editing && (
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={saving} className="cursor-pointer">
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 cursor-pointer"
                  onClick={() => {
                    setEditing(false);
                    setName(profile.name || "");
                    setEmail(profile.email);
                    setProfileStatus(null);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* GDPR Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Download className="h-4 w-4 text-emerald-500" />
            Export Your Data
          </CardTitle>
          <CardDescription>
            Download all your data as JSON (GDPR Article 20 — Right to Data Portability).
            Includes scans, violations, API keys, workspace info, and account metadata.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="gap-2"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Preparing export..." : "Download My Data"}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone — Account Deletion */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This action cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showDeleteConfirm ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete My Account
            </Button>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 max-w-md">
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                This will permanently delete:
              </p>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 pl-4 list-disc">
                <li>Your profile and credentials</li>
                <li>All scan history and violation data</li>
                <li>API keys and integrations</li>
                <li>Workspace memberships</li>
              </ul>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Type <strong>DELETE</strong> to confirm:
              </p>
              <Input
                type="text"
                placeholder="Type DELETE"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="max-w-50 text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== "DELETE" || deleting}
                  className="gap-2"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Deleting..." : "Permanently Delete Account"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────── General Tab ─────────────── */
function GeneralTab() {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "Passwords do not match" });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", message: "Password must be at least 8 characters" });
      return;
    }
    setSaving(true);
    setPasswordStatus(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPasswordStatus({ type: "success", message: "Password updated successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        setPasswordStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch {
      setPasswordStatus({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Change Password</CardTitle>
          <CardDescription>Update your account password. Only applies to email/password accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-3 max-w-sm">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {passwordStatus && (
              <p className={`text-xs ${passwordStatus.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {passwordStatus.message}
              </p>
            )}
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Platform Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("settings.platformInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
            <code className="flex-1 min-w-0 break-all rounded bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white border border-green-200 dark:border-green-800 font-mono">
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
                  <code className="text-xs text-neutral-500 dark:text-neutral-400">{key.prefix}••••••••</code>
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
/* ─────────────── Integrations Tab ─────────────── */
function IntegrationsTab() {
  return (
    <div className="space-y-6">
      {/* GitHub — configured on the dedicated Integrations page (DB-backed connector) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            <CardTitle className="text-sm">GitHub</CardTitle>
          </div>
          <CardDescription>Auto-create issues from violations and run CI checks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Connect a repository on the Integrations page. Credentials are stored securely
            server-side, then you can open GitHub issues straight from any scan report.
          </p>
          <a
            href="/integrations"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            Configure on Integrations
          </a>
          <div className="mt-2 rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
            <p className="font-medium">After connecting:</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModernSelect
              options={[{ value: "score_below", label: "Score drops below" }, { value: "score_drop", label: "Score drops by" }, { value: "new_critical", label: "Critical violations exceed" }, { value: "new_violations", label: "Total violations exceed" }]}
              value={condition}
              onChange={setCondition}
            />
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
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">
            All triggers are logged in the audit trail and dispatched via webhook.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
