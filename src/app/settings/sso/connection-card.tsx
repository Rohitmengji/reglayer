"use client";

/**
 * RegLayer — one SSO connection card (admin).
 *
 * Status + rollout stage + enable/disable + delete, plus domain management
 * (add → shows the DNS TXT record to publish → verify) and the role-mapping
 * editor. All actions hit /api/sso/* and toast the result; the parent refetches
 * on delete.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModernSelect } from "@/components/ui/modern-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useI18n } from "@/components/i18n-provider";
import { ShieldCheck, Globe, CheckCircle2, Clock, Trash2, Users2, ChevronDown, ChevronRight } from "lucide-react";
import { RoleMappingEditor } from "./role-mapping-editor";
import type { RolloutStage, SsoConnectionView, SsoDomainView } from "./types";

const ROLLOUT_OPTIONS = [
  { value: "DISABLED", label: "Disabled" },
  { value: "INTERNAL", label: "Internal" },
  { value: "BETA", label: "Beta" },
  { value: "GA", label: "GA" },
];

// Two meaningful choices; an existing ENFORCED_VERIFIED_DOMAINS value displays as "Required".
const ENFORCEMENT_OPTIONS = [
  { value: "OPTIONAL", label: "Optional" },
  { value: "ENFORCED", label: "Required (SSO only)" },
];

function rolloutBadge(stage: RolloutStage): "success" | "default" | "secondary" {
  if (stage === "GA") return "success";
  if (stage === "DISABLED") return "secondary";
  return "default";
}

export function ConnectionCard({ connection, onDeleted }: { connection: SsoConnectionView; onDeleted: () => void }) {
  const { t } = useI18n();
  const [domains, setDomains] = useState<SsoDomainView[]>(connection.domains);
  const [rolloutStage, setRolloutStage] = useState<RolloutStage>(connection.rolloutStage);
  const [enforcement, setEnforcement] = useState<string>(connection.enforcementPolicy === "OPTIONAL" ? "OPTIONAL" : "ENFORCED");
  const [disabled, setDisabled] = useState<boolean>(!!connection.disabledAt);
  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [txtHint, setTxtHint] = useState<{ domain: string; txtRecord: string } | null>(null);
  const [showMappings, setShowMappings] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const id = connection.id;
  // Show the expiry DATE (parsing a fixed string is pure); urgency is conveyed by
  // the healthStatus badge (WARNING/EXPIRED_CERT), which the health cron maintains.
  const certExpiry = connection.certificateExpiresAt ? new Date(connection.certificateExpiresAt) : null;

  async function patch(body: Record<string, unknown>, pending: string, ok: string): Promise<boolean> {
    const toastId = toast.loading(pending);
    const res = await fetch(`/api/sso/connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(ok, { id: toastId });
      return true;
    }
    const d = await res.json().catch(() => ({}));
    toast.error(d.error || t("sso.toastUpdateFailed"), { id: toastId });
    return false;
  }

  async function changeRollout(stage: string) {
    if (await patch({ rolloutStage: stage }, t("sso.toastRollout"), t("sso.toastRolloutDone"))) setRolloutStage(stage as RolloutStage);
  }
  async function changeEnforcement(policy: string) {
    if (await patch({ enforcementPolicy: policy }, t("sso.toastEnforcement"), policy === "OPTIONAL" ? t("sso.toastSetOptional") : t("sso.toastSetRequired"))) {
      setEnforcement(policy);
    }
  }
  async function toggleDisabled() {
    const next = !disabled;
    if (await patch({ disabled: next }, next ? t("sso.toastDisabling") : t("sso.toastEnabling"), next ? t("sso.toastDisabled") : t("sso.toastEnabled"))) setDisabled(next);
  }

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    const domain = newDomain.trim();
    if (!domain) return;
    setAddingDomain(true);
    const toastId = toast.loading(t("sso.toastAddingDomain"));
    try {
      const res = await fetch(`/api/sso/connections/${id}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ? `${data.error}${data.reason ? ` (${data.reason})` : ""}` : t("sso.toastAddDomainFailed"), { id: toastId });
        return;
      }
      toast.success(t("sso.toastDomainAdded"), { id: toastId });
      setDomains((ds) => (ds.some((d) => d.id === data.domain.id) ? ds : [...ds, { ...data.domain, isPrimary: false }]));
      setTxtHint({ domain: data.domain.domain, txtRecord: data.txtRecord });
      setNewDomain("");
    } finally {
      setAddingDomain(false);
    }
  }

  async function verifyDomain(domainId: string) {
    setVerifying(domainId);
    const toastId = toast.loading(t("sso.toastCheckingDns"));
    try {
      const res = await fetch(`/api/sso/domains/${domainId}/verify`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("sso.toastVerifyError"), { id: toastId });
        return;
      }
      if (data.verified) {
        setDomains((ds) => ds.map((d) => (d.id === domainId ? { ...d, verificationStatus: "VERIFIED" } : d)));
        setTxtHint(null);
        toast.success(t("sso.toastDomainVerified"), { id: toastId });
      } else {
        toast.error(t("sso.toastTxtNotFound"), { id: toastId });
        if (data.expectedTxtRecord) {
          setTxtHint({ domain: domains.find((d) => d.id === domainId)?.domain ?? "", txtRecord: data.expectedTxtRecord });
        }
      }
    } finally {
      setVerifying(null);
    }
  }

  async function doDelete() {
    const toastId = toast.loading(t("sso.toastDeleting"));
    const res = await fetch(`/api/sso/connections/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("sso.toastDeleted"), { id: toastId });
      onDeleted();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || t("sso.toastDeleteFailed"), { id: toastId });
    }
    setDeleteOpen(false);
  }

  const hasVerifiedDomain = domains.some((d) => d.verificationStatus === "VERIFIED");

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2 shrink-0">
              <ShieldCheck className="h-5 w-5 text-neutral-600 dark:text-neutral-300" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-neutral-900 dark:text-white truncate">{connection.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{connection.protocol}</Badge>
                <Badge variant={rolloutBadge(rolloutStage)}>{rolloutStage}</Badge>
                <Badge variant={connection.healthStatus === "ACTIVE" ? "success" : "serious"}>{connection.healthStatus}</Badge>
                {disabled && <Badge variant="destructive">{t("sso.disabledBadge")}</Badge>}
              </div>
              {certExpiry && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {t("sso.certExpires", { date: certExpiry.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) })}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <ModernSelect options={ROLLOUT_OPTIONS} value={rolloutStage} onChange={changeRollout} />
            <ModernSelect options={ENFORCEMENT_OPTIONS} value={enforcement} onChange={changeEnforcement} />
            <button
              type="button"
              onClick={toggleDisabled}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              {disabled ? t("sso.enable") : t("sso.disable")}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="rounded-md p-2 text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              title={t("sso.deleteConnectionTooltip")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!hasVerifiedDomain && (
          <p className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            {t("sso.noVerifiedDomain")}
          </p>
        )}

        {/* Domains */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <Globe className="h-3.5 w-3.5" /> {t("sso.domains")}
          </p>
          {domains.length === 0 ? (
            <p className="text-xs text-neutral-400">{t("sso.noDomains")}</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {domains.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 py-1.5 first:pt-0">
                  <span className="text-sm text-neutral-800 dark:text-neutral-100 truncate">{d.domain}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {d.verificationStatus === "VERIFIED" ? (
                      <Badge variant="success">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> {t("sso.verified")}
                      </Badge>
                    ) : (
                      <>
                        <Badge variant="outline">
                          <Clock className="mr-1 h-3 w-3" /> {t("sso.pending")}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => verifyDomain(d.id)}
                          disabled={verifying === d.id}
                          className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                        >
                          {verifying === d.id ? t("sso.checking") : t("sso.verify")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {txtHint && (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-3 py-2">
              <p className="text-xs text-neutral-600 dark:text-neutral-300">{t("sso.publishTxt", { domain: txtHint.domain })}</p>
              <code className="mt-1 block break-all rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-100 dark:bg-black">{txtHint.txtRecord}</code>
            </div>
          )}

          <form onSubmit={addDomain} className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder={t("sso.domainPlaceholder")}
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm dark:bg-neutral-800 dark:text-neutral-100"
            />
            <button
              type="submit"
              disabled={addingDomain}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {addingDomain ? t("sso.adding") : t("sso.addDomain")}
            </button>
          </form>
        </div>

        {/* Role mappings (collapsible) */}
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3">
          <button
            type="button"
            onClick={() => setShowMappings((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            {showMappings ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Users2 className="h-3.5 w-3.5" /> {t("sso.roleMappings")}
          </button>
          {showMappings && (
            <div className="pt-2">
              <RoleMappingEditor connectionId={id} />
            </div>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={deleteOpen}
        title={t("sso.deleteDialogTitle")}
        description={t("sso.deleteDialogDesc", { label: connection.label })}
        confirmLabel={t("sso.delete")}
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </Card>
  );
}
