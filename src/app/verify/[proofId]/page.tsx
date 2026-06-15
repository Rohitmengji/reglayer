"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Public Proof Verification Page
 * ---------------------------------------------------------
 *
 * WHY: A compliance proof is only trustworthy if ANYONE can verify it
 * independently. This public page lets auditors, regulators, or customers
 * confirm that a proof is tamper-evident — without logging in or trusting
 * RegLayer's word for it.
 *
 * WHAT:
 * - Client-fetches the PUBLIC /api/vault/[proofId]/verify endpoint
 * - Shows a clear ✓ Verified / ✗ Failed badge
 * - Surfaces chain position, issue date, standard, title, and the hash
 * - Lists any integrity issues found while walking the chain
 *
 * HOW:
 * - No auth. Endpoint returns only non-sensitive integrity fields.
 * - Styling mirrors the public report page for a trustworthy, consistent look.
 * ---------------------------------------------------------
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Shield, ShieldCheck, ShieldAlert, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VerifyReport {
  proofId: string;
  valid: boolean;
  hashValid: boolean;
  chainValid: boolean;
  chainIndex: number;
  chainLength: number;
  issuedAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
  standard: string;
  title: string;
  hash: string;
  issues: Array<{ index: number; id: string; problem: string }>;
}

const PROBLEM_LABEL: Record<string, string> = {
  "hash-mismatch": "Evidence hash does not match (tampered evidence)",
  "broken-link": "Chain linkage broken (reordered or removed proof)",
  "index-gap": "Missing proof in the chain sequence",
  "duplicate-index": "Duplicate position in the chain",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VerifyProofPage({ params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = use(params);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Captured at fetch time (not during render) to keep the component pure.
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/vault/${proofId}/verify`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : "Verification failed");
        } else {
          const r = data as VerifyReport;
          setReport(r);
          setExpired(!!r.expiresAt && new Date(r.expiresAt).getTime() < Date.now());
        }
      } catch {
        if (!cancelled) setError("Could not reach the verification service.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [proofId]);

  const revoked = !!report?.revokedAt;
  const verified = !!report?.valid;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-500" />
            <span className="text-sm font-bold text-neutral-900 dark:text-white">RegLayer</span>
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-600 transition-colors"
          >
            Get Compliance Proofs
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Proof Verification
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Independent, tamper-evident integrity check of this compliance proof.
          </p>
        </div>

        {loading && (
          <div className="mt-10 flex flex-col items-center justify-center gap-3 text-neutral-500 dark:text-neutral-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">Verifying proof integrity…</span>
          </div>
        )}

        {!loading && error && (
          <Card className="mt-10">
            <CardContent className="py-10 text-center">
              <ShieldAlert className="mx-auto h-10 w-10 text-red-500" />
              <p className="mt-4 text-base font-semibold text-neutral-900 dark:text-white">
                Proof not found
              </p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && report && (
          <>
            {/* Result hero */}
            <div className="mt-8 text-center">
              <div
                className={`inline-flex h-24 w-24 items-center justify-center rounded-full ring-4 ${
                  verified
                    ? "bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/20 dark:ring-emerald-800"
                    : "bg-red-50 ring-red-200 dark:bg-red-950/20 dark:ring-red-800"
                }`}
              >
                {verified ? (
                  <ShieldCheck className="h-12 w-12 text-emerald-500" />
                ) : (
                  <ShieldAlert className="h-12 w-12 text-red-500" />
                )}
              </div>
              <div className="mt-5">
                {verified ? (
                  <Badge variant="success" className="px-3 py-1 text-sm">
                    ✓ Verified — tamper-evident
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="px-3 py-1 text-sm">
                    ✗ Integrity check failed
                  </Badge>
                )}
              </div>
              {!verified && (revoked || expired) && (
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                  {revoked
                    ? "This proof has been revoked by its issuer."
                    : "This proof has expired."}
                </p>
              )}
            </div>

            {/* Details */}
            <Card className="mt-8">
              <CardContent className="divide-y divide-neutral-100 p-0 dark:divide-neutral-800">
                <DetailRow label="Title" value={report.title} />
                <DetailRow label="Standard" value={report.standard} />
                <DetailRow
                  label="Chain position"
                  value={`#${report.chainIndex} of ${report.chainLength}`}
                />
                <DetailRow label="Issued" value={formatDate(report.issuedAt)} />
                {report.expiresAt && (
                  <DetailRow label="Expires" value={formatDate(report.expiresAt)} />
                )}
                {report.revokedAt && (
                  <DetailRow label="Revoked" value={formatDate(report.revokedAt)} />
                )}
                <DetailRow
                  label="Evidence hash recomputes"
                  value={report.hashValid ? "Yes" : "No"}
                  valueClass={report.hashValid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                />
                <DetailRow
                  label="Chain linkage intact"
                  value={report.chainValid ? "Yes" : "No"}
                  valueClass={report.chainValid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
                />
                <div className="px-5 py-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    SHA-256 Hash
                  </div>
                  <code className="mt-1.5 block break-all rounded-md bg-neutral-100 px-3 py-2 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {report.hash}
                  </code>
                </div>
              </CardContent>
            </Card>

            {/* Issues */}
            {report.issues.length > 0 && (
              <Card className="mt-6 border-red-200 dark:border-red-900/50">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
                    <ShieldAlert className="h-4 w-4" />
                    Integrity issues detected
                  </div>
                  <ul className="mt-3 space-y-2">
                    {report.issues.map((issue, i) => (
                      <li
                        key={`${issue.id}-${issue.problem}-${i}`}
                        className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                      >
                        <span className="mt-0.5 inline-flex h-5 min-w-10 items-center justify-center rounded bg-red-100 px-1.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          #{issue.index}
                        </span>
                        <span>{PROBLEM_LABEL[issue.problem] ?? issue.problem}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <p className="mt-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
              This proof is anchored in a hash chain. Each proof commits to the previous
              one, so tampering with any record — or its order — is detectable.
            </p>
          </>
        )}

        {/* Powered by */}
        <div className="mt-8 text-center">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Powered by{" "}
            <Link href="/" className="font-medium text-indigo-500 hover:text-indigo-400">
              RegLayer
            </Link>{" "}
            — Tamper-Evident Compliance Proofs
          </p>
        </div>
      </main>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass = "text-neutral-900 dark:text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span className={`text-sm font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
