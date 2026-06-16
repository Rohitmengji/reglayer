"use client";

/**
 * RegLayer — Scan Auth Section Component
 *
 * WHY: Enterprise users need to configure authentication before scanning
 *      pages behind login walls. This collapsible section in the scan form
 *      lets them choose an auth method and provide credentials.
 *
 * WHAT: Dynamic form that shows relevant fields per auth method.
 *       Supports: None, Cookies, Form Login, Basic Auth, Headers.
 *       Also shows saved configs as a reusable dropdown.
 *
 * Security:
 * - All credential fields use type="password" and autocomplete="off"
 * - Never displays saved credentials back (shows "••••••" with "Replace" pattern)
 * - Credentials are only sent to server, never stored in client state beyond form
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Shield, Plus, Trash2, TestTube } from "lucide-react";
import type { AuthConfig } from "@/lib/validations/auth";
import { useI18n } from "@/components/i18n-provider";
import { toast } from "sonner";

interface SavedConfig {
  id: string;
  name: string;
  domain?: string | null;
  method: string;
  createdAt: string;
}

interface ScanAuthSectionProps {
  /** Called when auth config changes. Parent passes this to scan options. */
  onAuthChange: (config: AuthConfig | undefined) => void;
  /**
   * Called when the user selects (or clears) a SAVED auth config. The parent
   * sends this id to the API as `authConfigId`, which is resolved + decrypted
   * server-side — so saved configs actually authenticate the crawl instead of
   * silently running unauthenticated.
   */
  onSavedConfigChange?: (savedConfigId: string | undefined) => void;
  /** Target URL for testing auth (from the scan URL input) */
  scanUrl?: string;
}

export function ScanAuthSection({ onAuthChange, onSavedConfigChange, scanUrl }: ScanAuthSectionProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [method, setMethod] = useState<AuthConfig["method"]>("none");
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string>("");
  const [isTesting, setIsTesting] = useState(false);

  // Form login fields
  const [loginUrl, setLoginUrl] = useState("");
  const [usernameSelector, setUsernameSelector] = useState("#username");
  const [passwordSelector, setPasswordSelector] = useState("#password");
  const [submitSelector, setSubmitSelector] = useState("button[type='submit']");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [successIndicator, setSuccessIndicator] = useState("");

  // Basic auth fields
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");

  // Headers fields
  const [headerEntries, setHeaderEntries] = useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);

  // Cookie fields
  const [cookieEntries, setCookieEntries] = useState<Array<{ name: string; value: string; domain: string }>>([
    { name: "", value: "", domain: "" },
  ]);

  // Save config
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");

  // Load saved configs on mount
  useEffect(() => {
    fetch("/api/auth-configs")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.configs) setSavedConfigs(data.configs);
      })
      .catch(() => { /* silent */ });
  }, []);

  // Build auth config from current form state
  const buildAuthConfig = useCallback((): AuthConfig | undefined => {
    switch (method) {
      case "none":
        return undefined;
      case "form":
        if (!loginUrl || !formUsername || !formPassword) return undefined;
        return {
          method: "form",
          loginUrl,
          usernameSelector,
          passwordSelector,
          submitSelector,
          username: formUsername,
          password: formPassword,
          ...(successIndicator && { successIndicator }),
        };
      case "basic":
        if (!basicUsername || !basicPassword) return undefined;
        return { method: "basic", username: basicUsername, password: basicPassword };
      case "headers": {
        const validHeaders = headerEntries.filter((h) => h.key && h.value);
        if (validHeaders.length === 0) return undefined;
        const headers: Record<string, string> = {};
        for (const h of validHeaders) headers[h.key] = h.value;
        return { method: "headers", headers };
      }
      case "cookies": {
        const validCookies = cookieEntries.filter((c) => c.name && c.value && c.domain);
        if (validCookies.length === 0) return undefined;
        return {
          method: "cookies",
          cookies: validCookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain })),
        };
      }
    }
  }, [method, loginUrl, usernameSelector, passwordSelector, submitSelector, formUsername, formPassword, successIndicator, basicUsername, basicPassword, headerEntries, cookieEntries]);

  // Notify parent on config change
  useEffect(() => {
    if (selectedSavedId) return; // Using saved config — handled separately
    onAuthChange(buildAuthConfig());
  }, [buildAuthConfig, onAuthChange, selectedSavedId]);

  function handleMethodChange(newMethod: AuthConfig["method"]) {
    setMethod(newMethod);
    // Choosing a method deselects any saved config (the user is now defining
    // auth inline) — clear it both locally and for the parent.
    setSelectedSavedId("");
    onSavedConfigChange?.(undefined);
    if (newMethod === "none") {
      onAuthChange(undefined);
    }
  }

  function handleUseSaved(configId: string) {
    // Toggle off if the same row is clicked again.
    const next = selectedSavedId === configId ? "" : configId;
    setSelectedSavedId(next);
    // The credentials live encrypted server-side; we send only the id. The crawl
    // API resolves + decrypts it (workspace-scoped). Clear any inline auth so the
    // saved config is unambiguously the source of truth.
    onAuthChange(undefined);
    onSavedConfigChange?.(next || undefined);
  }

  async function handleTestAuth() {
    if (!scanUrl) {
      toast.error("Enter a scan URL first to test authentication");
      return;
    }

    setIsTesting(true);
    try {
      if (selectedSavedId) {
        // Test saved config
        const res = await fetch(`/api/auth-configs/${selectedSavedId}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testUrl: scanUrl }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`Auth test passed — reached ${data.pageTitle || data.finalUrl}`);
        } else {
          toast.error(data.message || "Auth test failed");
        }
      } else {
        toast.error("Save the config first to test it");
      }
    } catch {
      toast.error("Failed to test auth config");
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSaveConfig() {
    const config = buildAuthConfig();
    if (!config || config.method === "none") {
      toast.error("Configure authentication before saving");
      return;
    }
    if (!saveName.trim()) {
      toast.error("Enter a name for this config");
      return;
    }

    try {
      const res = await fetch("/api/auth-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          domain: scanUrl ? new URL(scanUrl).hostname : undefined,
          config,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save");
        return;
      }

      const saved = await res.json();
      setSavedConfigs((prev) => [saved, ...prev]);
      setShowSave(false);
      setSaveName("");
      toast.success(`Auth config "${saved.name}" saved`);
    } catch {
      toast.error("Failed to save auth config");
    }
  }

  async function handleDeleteSaved(configId: string) {
    try {
      const res = await fetch(`/api/auth-configs/${configId}`, { method: "DELETE" });
      if (res.ok) {
        setSavedConfigs((prev) => prev.filter((c) => c.id !== configId));
        if (selectedSavedId === configId) {
          setSelectedSavedId("");
          onSavedConfigChange?.(undefined);
        }
        toast.success("Auth config deleted");
      }
    } catch {
      toast.error("Failed to delete config");
    }
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
          <Shield className="h-4 w-4 text-violet-500" />
          {t("scanAuth.title")}
          {method !== "none" && (
            <span className="text-xs px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 rounded">
              {method}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-4">
          {/* Saved Configs */}
          {savedConfigs.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs text-neutral-500">{t("scanAuth.savedConfigs")}</label>
              <div className="space-y-1">
                {savedConfigs.map((config) => (
                  <div
                    key={config.id}
                    className={`flex items-center justify-between p-2 rounded text-sm cursor-pointer transition-colors ${
                      selectedSavedId === config.id
                        ? "bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700"
                        : "hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    }`}
                    onClick={() => handleUseSaved(config.id)}
                  >
                    <div>
                      <span className="font-medium">{config.name}</span>
                      <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">{config.method}</span>
                      {config.domain && (
                        <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">{config.domain}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSaved(config.id); }}
                      className="p-1 text-neutral-500 dark:text-neutral-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Method Selector */}
          <div className="space-y-2">
            <label className="text-xs text-neutral-500">{t("scanAuth.authMethod")}</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
              {(["none", "cookies", "form", "basic", "headers"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMethodChange(m)}
                  className={`px-2 py-1.5 text-xs rounded transition-colors ${
                    method === m
                      ? "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 font-medium"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  }`}
                >
                  {m === "none" ? t("scanAuth.none") : m === "cookies" ? t("scanAuth.cookies") : m === "form" ? t("scanAuth.form") : m === "basic" ? t("scanAuth.basic") : t("scanAuth.headers")}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Fields Per Method */}
          {method === "form" && (
            <Card>
              <CardContent className="p-3 space-y-3">
                <div>
                  <label className="text-xs">Login URL</label>
                  <Input
                    type="url"
                    placeholder="https://app.example.com/login"
                    value={loginUrl}
                    onChange={(e) => setLoginUrl(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs">Username</label>
                    <Input
                      type="text"
                      autoComplete="off"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs">Password</label>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs">Username Selector</label>
                    <Input
                      type="text"
                      placeholder="#email"
                      value={usernameSelector}
                      onChange={(e) => setUsernameSelector(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs">Password Selector</label>
                    <Input
                      type="text"
                      placeholder="#password"
                      value={passwordSelector}
                      onChange={(e) => setPasswordSelector(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs">Submit Selector</label>
                    <Input
                      type="text"
                      placeholder="button[type='submit']"
                      value={submitSelector}
                      onChange={(e) => setSubmitSelector(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs">Success Indicator (optional)</label>
                  <Input
                    type="text"
                    placeholder=".dashboard, #main-content"
                    value={successIndicator}
                    onChange={(e) => setSuccessIndicator(e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {method === "basic" && (
            <Card>
              <CardContent className="p-3 space-y-3">
                <div>
                  <label className="text-xs">Username</label>
                  <Input
                    type="text"
                    autoComplete="off"
                    value={basicUsername}
                    onChange={(e) => setBasicUsername(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs">Password</label>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={basicPassword}
                    onChange={(e) => setBasicPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {method === "headers" && (
            <Card>
              <CardContent className="p-3 space-y-2">
                {headerEntries.map((entry, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                    <Input
                      type="text"
                      placeholder="Authorization"
                      value={entry.key}
                      onChange={(e) => {
                        const updated = [...headerEntries];
                        updated[i] = { ...entry, key: e.target.value };
                        setHeaderEntries(updated);
                      }}
                      className="font-mono text-xs"
                    />
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Bearer token..."
                      value={entry.value}
                      onChange={(e) => {
                        const updated = [...headerEntries];
                        updated[i] = { ...entry, value: e.target.value };
                        setHeaderEntries(updated);
                      }}
                      className="font-mono text-xs"
                    />
                    {headerEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setHeaderEntries(headerEntries.filter((_, idx) => idx !== i))}
                        className="p-1 text-neutral-500 dark:text-neutral-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHeaderEntries([...headerEntries, { key: "", value: "" }])}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" /> {t("scanAuth.addHeader")}
                </Button>
              </CardContent>
            </Card>
          )}

          {method === "cookies" && (
            <Card>
              <CardContent className="p-3 space-y-2">
                {cookieEntries.map((entry, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2">
                    <Input
                      type="text"
                      placeholder={t("scanAuth.namePlaceholder")}
                      value={entry.name}
                      onChange={(e) => {
                        const updated = [...cookieEntries];
                        updated[i] = { ...entry, name: e.target.value };
                        setCookieEntries(updated);
                      }}
                      className="font-mono text-xs"
                    />
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder={t("scanAuth.valuePlaceholder")}
                      value={entry.value}
                      onChange={(e) => {
                        const updated = [...cookieEntries];
                        updated[i] = { ...entry, value: e.target.value };
                        setCookieEntries(updated);
                      }}
                      className="font-mono text-xs"
                    />
                    <Input
                      type="text"
                      placeholder={t("scanAuth.domainPlaceholder")}
                      value={entry.domain}
                      onChange={(e) => {
                        const updated = [...cookieEntries];
                        updated[i] = { ...entry, domain: e.target.value };
                        setCookieEntries(updated);
                      }}
                      className="font-mono text-xs"
                    />
                    {cookieEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCookieEntries(cookieEntries.filter((_, idx) => idx !== i))}
                        className="p-1 text-neutral-500 dark:text-neutral-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCookieEntries([...cookieEntries, { name: "", value: "", domain: "" }])}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" /> {t("scanAuth.addCookie")}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Actions: Test & Save */}
          {method !== "none" && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestAuth}
                disabled={isTesting || !scanUrl}
                className="text-xs"
              >
                <TestTube className="h-3 w-3 mr-1" />
                {isTesting ? t("scanAuth.testing") : t("scanAuth.testAuth")}
              </Button>

              {!showSave ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSave(true)}
                  className="text-xs"
                >
                  {t("scanAuth.saveForReuse")}
                </Button>
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="text"
                    placeholder={t("scanAuth.configName")}
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    className="text-xs h-8"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveConfig}
                    className="text-xs"
                  >
                    Save
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
