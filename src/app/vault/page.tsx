/**
 * RegLayer — Compliance Proof Vault Page
 *
 * WHY: Legal/compliance teams need a single view of all compliance evidence.
 * WHAT: Lists all issued proofs with status, integrity hash, and verification.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/i18n-provider";
import { AppShell } from "@/components/layout/app-shell";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Clock,
  Download,
  CheckCircle2,
  XCircle,
  FileCheck,
  Hash,
  ExternalLink,
} from "lucide-react";

interface Proof {
  id: string;
  type: string;
  title: string;
  score: number | null;
  standard: string;
  hash: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  site: { id: string; url: string; name: string | null };
}

const TYPE_LABELS: Record<string, string> = {
  SCAN_CERTIFICATE: "Scan Certificate",
  COMPLIANCE_SNAPSHOT: "Compliance Snapshot",
  REMEDIATION_RECORD: "Remediation Record",
  AUDIT_ATTESTATION: "Audit Attestation",
  CONTINUOUS_MONITORING: "Continuous Monitoring",
};

const TYPE_COLORS: Record<string, string> = {
  SCAN_CERTIFICATE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  COMPLIANCE_SNAPSHOT: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  REMEDIATION_RECORD: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  AUDIT_ATTESTATION: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  CONTINUOUS_MONITORING: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
};

export default function VaultPage() {
  const { t } = useI18n();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ id: string; valid: boolean } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadProofs = useCallback(async () => {
    try {
      const wsRes = await fetch("/api/workspaces/current");
      if (!wsRes.ok) return;
      const { workspace } = await wsRes.json();

      const res = await fetch(`/api/vault?workspaceId=${workspace.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setProofs(data.proofs);
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kick off the initial client-side data fetch (sets loading state synchronously)
    loadProofs();
  }, [loadProofs]);

  const handleVerify = async (proofId: string) => {
    setVerifying(proofId);
    setVerifyResult(null);
    try {
      const res = await fetch(`/api/vault/${proofId}/verify`, { method: "POST" });
      const data = await res.json();
      setVerifyResult({ id: proofId, valid: data.valid });
    } catch {
      setVerifyResult({ id: proofId, valid: false });
    } finally {
      setVerifying(null);
    }
  };

  // Revoke a proof. The server enforces OWNER/ADMIN membership, so non-admins get
  // a clear error rather than a silent no-op. A reason is required and recorded —
  // it surfaces on the proof's public verification page.
  const handleRevoke = async (proofId: string) => {
    const reason = window.prompt(
      "Revoke this compliance proof? Enter a reason — it is recorded and shown on the proof's public verification page."
    );
    if (!reason || !reason.trim()) return;
    setRevoking(proofId);
    setActionError(null);
    try {
      const res = await fetch(`/api/vault/${proofId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke proof");
      }
      await loadProofs();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to revoke proof");
    } finally {
      setRevoking(null);
    }
  };

  // Download the proof as a self-contained JSON certificate (the "download for
  // offline storage" the UI advertises) — includes the public verification URL
  // so a recipient can independently confirm it.
  const downloadProof = (proof: Proof) => {
    const record = {
      ...proof,
      verifyUrl: `${window.location.origin}/verify/${proof.id}`,
      exportedAt: new Date().toISOString(),
      issuer: "RegLayer",
    };
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reglayer-proof-${proof.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const getStatus = (proof: Proof) => {
    if (proof.revokedAt) return "revoked";
    if (proof.expiresAt && new Date(proof.expiresAt) < new Date()) return "expired";
    return "valid";
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              {t("vault.title")}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("vault.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">Total Proofs</div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{total}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">Valid</div>
          <div className="text-2xl font-bold text-green-600">
            {proofs.filter((p) => getStatus(p) === "valid").length}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">Expired</div>
          <div className="text-2xl font-bold text-amber-600">
            {proofs.filter((p) => getStatus(p) === "expired").length}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">Revoked</div>
          <div className="text-2xl font-bold text-red-600">
            {proofs.filter((p) => getStatus(p) === "revoked").length}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          {actionError}
        </div>
      )}

      {/* Proof List */}
      {proofs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
          <FileCheck className="mx-auto mb-3 h-12 w-12 text-neutral-500 dark:text-neutral-400" />
          <h3 className="text-lg font-medium text-neutral-900 dark:text-white">No proofs yet</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Issued compliance proofs are tamper-evident certificates you can verify, download, or revoke. Once a proof is issued for a scan, it appears here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proofs.map((proof) => {
            const status = getStatus(proof);
            return (
              <div
                key={proof.id}
                className="rounded-lg border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {status === "valid" && (
                        <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
                      )}
                      {status === "expired" && (
                        <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      {status === "revoked" && (
                        <ShieldX className="h-4 w-4 shrink-0 text-red-600" />
                      )}
                      <span className="font-medium text-neutral-900 dark:text-white truncate">
                        {proof.title}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[proof.type] ?? "bg-neutral-100 text-neutral-700"}`}
                      >
                        {TYPE_LABELS[proof.type] ?? proof.type}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {proof.site.name || new URL(proof.site.url).hostname}
                      </span>
                      <span>{proof.standard}</span>
                      {proof.score !== null && (
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          Score: {proof.score.toFixed(0)}
                        </span>
                      )}
                      <span>
                        {new Date(proof.issuedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1 text-xs font-mono text-neutral-400 dark:text-neutral-500">
                      <Hash className="h-3 w-3" />
                      <span className="truncate">{proof.hash}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {verifyResult?.id === proof.id && (
                      <span
                        className={`flex items-center gap-1 text-xs font-medium ${verifyResult.valid ? "text-green-600" : "text-red-600"}`}
                      >
                        {verifyResult.valid ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3.5 w-3.5" /> Invalid
                          </>
                        )}
                      </span>
                    )}
                    <button
                      onClick={() => handleVerify(proof.id)}
                      disabled={verifying === proof.id}
                      className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                      {verifying === proof.id ? "Verifying..." : "Verify"}
                    </button>
                    <button
                      onClick={() => downloadProof(proof)}
                      aria-label={`Download proof ${proof.title}`}
                      title="Download proof (JSON)"
                      className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-700"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {status !== "revoked" && (
                      <button
                        onClick={() => handleRevoke(proof.id)}
                        disabled={revoking === proof.id}
                        title="Revoke this proof (owners/admins only)"
                        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        {revoking === proof.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </AppShell>
  );
}
