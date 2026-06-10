/**
 * RegLayer — Compliance Proof Vault Page
 *
 * WHY: Legal/compliance teams need a single view of all compliance evidence.
 * WHAT: Lists all issued proofs with status, integrity hash, and verification.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
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
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ id: string; valid: boolean } | null>(null);

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

  const getStatus = (proof: Proof) => {
    if (proof.revokedAt) return "revoked";
    if (proof.expiresAt && new Date(proof.expiresAt) < new Date()) return "expired";
    return "valid";
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Compliance Proof Vault
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tamper-evident compliance records for audits and legal defense
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Proofs</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{total}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Valid</div>
          <div className="text-2xl font-bold text-green-600">
            {proofs.filter((p) => getStatus(p) === "valid").length}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Expired</div>
          <div className="text-2xl font-bold text-amber-600">
            {proofs.filter((p) => getStatus(p) === "expired").length}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-sm text-gray-500 dark:text-gray-400">Revoked</div>
          <div className="text-2xl font-bold text-red-600">
            {proofs.filter((p) => getStatus(p) === "revoked").length}
          </div>
        </div>
      </div>

      {/* Proof List */}
      {proofs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center dark:border-gray-600 dark:bg-gray-800/50">
          <FileCheck className="mx-auto mb-3 h-12 w-12 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No proofs yet</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Compliance proofs are automatically generated when scans complete with passing scores.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {proofs.map((proof) => {
            const status = getStatus(proof);
            return (
              <div
                key={proof.id}
                className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-gray-700 dark:bg-gray-800"
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
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {proof.title}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[proof.type] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {TYPE_LABELS[proof.type] ?? proof.type}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {proof.site.name || new URL(proof.site.url).hostname}
                      </span>
                      <span>{proof.standard}</span>
                      {proof.score !== null && (
                        <span className="font-medium text-gray-700 dark:text-gray-300">
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

                    <div className="mt-1.5 flex items-center gap-1 text-xs font-mono text-gray-400 dark:text-gray-500">
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
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {verifying === proof.id ? "Verifying..." : "Verify"}
                    </button>
                    <button className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700">
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
