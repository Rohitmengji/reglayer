"use client";

/**
 * RegLayer — Enterprise SSO admin page (/settings/sso).
 *
 * Lists the workspace's SSO connections and lets an OWNER/ADMIN create + manage
 * them over /api/sso/*. Wrapped in FeatureGate("sso") so non-Enterprise sees the
 * upgrade panel; the API re-enforces Enterprise + sso.manage (a non-admin in an
 * Enterprise workspace gets the "admins only" state below).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { FeatureGate } from "@/components/ui/feature-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModernSelect } from "@/components/ui/modern-select";
import { ShieldCheck, Plus, AlertTriangle, RotateCcw, Lock } from "lucide-react";
import { ConnectionCard } from "./connection-card";
import type { SsoConnectionView } from "./types";

const PROTOCOL_OPTIONS = [
  { value: "SAML", label: "SAML 2.0" },
  { value: "OIDC", label: "OIDC" },
];
const DEFAULT_ROLE_OPTIONS = [
  { value: "MEMBER", label: "Member" },
  { value: "VIEWER", label: "Viewer" },
  { value: "ADMIN", label: "Admin" },
];

function SsoSettingsInner() {
  const [connections, setConnections] = useState<SsoConnectionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<"none" | "forbidden" | "error">("none");
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [protocol, setProtocol] = useState("SAML");
  const [defaultRole, setDefaultRole] = useState("MEMBER");
  const [rawMetadata, setRawMetadata] = useState("");
  const [metadataUrl, setMetadataUrl] = useState("");
  const [oidcDiscoveryUrl, setOidcDiscoveryUrl] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sso/connections")
      .then((res) => {
        if (res.status === 403) throw new Error("forbidden");
        if (!res.ok) throw new Error("error");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setConnections(data.connections || []);
        setLoadError("none");
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message === "forbidden" ? "forbidden" : "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function resetForm() {
    setLabel("");
    setRawMetadata("");
    setMetadataUrl("");
    setOidcDiscoveryUrl("");
    setOidcClientId("");
    setOidcClientSecret("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const toastId = toast.loading("Creating connection…");
    try {
      const body: Record<string, unknown> = { label: label.trim(), protocol, defaultRole };
      if (protocol === "SAML") {
        if (rawMetadata.trim()) body.rawMetadata = rawMetadata.trim();
        else body.metadataUrl = metadataUrl.trim();
      } else {
        body.oidcDiscoveryUrl = oidcDiscoveryUrl.trim();
        body.oidcClientId = oidcClientId.trim();
        body.oidcClientSecret = oidcClientSecret.trim();
      }
      const res = await fetch("/api/sso/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to create connection", { id: toastId });
        return;
      }
      toast.success("Connection created", { id: toastId });
      resetForm();
      setShowAdd(false);
      reload();
    } finally {
      setCreating(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900 dark:text-white">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" /> Single Sign-On
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Connect your identity provider (Okta, Entra, Google Workspace…) so your team signs in with SAML or OIDC.
            </p>
          </div>
          {loadError !== "forbidden" && !showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors self-start sm:self-auto shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add connection
            </button>
          )}
        </div>

        {showAdd && loadError !== "forbidden" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New SSO connection</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="sso-label" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Connection name</label>
                    <input
                      id="sso-label"
                      type="text"
                      required
                      placeholder="e.g. Acme Okta"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Protocol</label>
                      <ModernSelect options={PROTOCOL_OPTIONS} value={protocol} onChange={setProtocol} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Default role</label>
                      <ModernSelect options={DEFAULT_ROLE_OPTIONS} value={defaultRole} onChange={setDefaultRole} />
                    </div>
                  </div>
                </div>

                {protocol === "SAML" ? (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="sso-metadata" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">IdP metadata XML</label>
                      <textarea
                        id="sso-metadata"
                        placeholder="Paste IdP SAML metadata XML…"
                        value={rawMetadata}
                        onChange={(e) => setRawMetadata(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm font-mono dark:bg-neutral-800 dark:text-neutral-100 resize-y"
                      />
                    </div>
                    <div>
                      <label htmlFor="sso-metadata-url" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                        Or provide a metadata URL
                      </label>
                      <input
                        id="sso-metadata-url"
                        type="url"
                        placeholder="https://idp.example.com/app/metadata"
                        value={metadataUrl}
                        onChange={(e) => setMetadataUrl(e.target.value)}
                        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="sso-discovery" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">OIDC discovery URL</label>
                      <input
                        id="sso-discovery"
                        type="url"
                        required
                        placeholder="https://…/.well-known/openid-configuration"
                        value={oidcDiscoveryUrl}
                        onChange={(e) => setOidcDiscoveryUrl(e.target.value)}
                        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sso-client-id" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Client ID</label>
                        <input
                          id="sso-client-id"
                          type="text"
                          required
                          placeholder="Client ID"
                          value={oidcClientId}
                          onChange={(e) => setOidcClientId(e.target.value)}
                          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                        />
                      </div>
                      <div>
                        <label htmlFor="sso-client-secret" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Client secret</label>
                        <input
                          id="sso-client-secret"
                          type="password"
                          required
                          placeholder="Client secret"
                          value={oidcClientSecret}
                          onChange={(e) => setOidcClientSecret(e.target.value)}
                          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-lg bg-neutral-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors"
                  >
                    {creating ? "Creating…" : "Create connection"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAdd(false); resetForm(); }}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-neutral-400">
                  After creating, add &amp; verify a domain and raise the rollout stage to start routing logins.
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-neutral-500">Loading connections…</CardContent>
          </Card>
        ) : loadError === "forbidden" ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Lock className="mx-auto mb-3 h-10 w-10 text-neutral-300 dark:text-neutral-600" aria-hidden="true" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Owners and admins only</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">You need the Owner or Admin role to manage SSO for this workspace.</p>
            </CardContent>
          </Card>
        ) : loadError === "error" ? (
          <Card>
            <CardContent className="py-10 text-center">
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" aria-hidden="true" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Couldn&apos;t load SSO connections</p>
              <button
                onClick={reload}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
              </button>
            </CardContent>
          </Card>
        ) : connections.length === 0 && !showAdd ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-neutral-300 dark:text-neutral-600" aria-hidden="true" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">No SSO connections yet</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                Add a connection to let your team sign in through your identity provider.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add your first connection
              </button>
            </CardContent>
          </Card>
        ) : connections.length > 0 ? (
          <div className="space-y-4">
            {connections.map((c) => (
              <ConnectionCard key={c.id} connection={c} onDeleted={reload} />
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function SsoSettingsPage() {
  return (
    <FeatureGate feature="sso">
      <SsoSettingsInner />
    </FeatureGate>
  );
}
