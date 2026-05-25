"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Shield, CheckCircle2, Award, ExternalLink, Calendar, Globe } from "lucide-react";

interface CertificateData {
  id: string;
  url: string;
  issuedAt: string;
  expiresAt: string;
  level: "gold" | "silver" | "bronze" | "in-progress";
  score: number;
  standard: string;
  wcagLevel: string;
  violations: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    total: number;
  };
  verificationUrl: string;
}

const levelConfig = {
  gold: {
    label: "Gold",
    color: "from-amber-400 to-yellow-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-300",
    description: "Exceeds EN 301 549 requirements",
  },
  silver: {
    label: "Silver",
    color: "from-neutral-300 to-neutral-400",
    bg: "bg-neutral-50 dark:bg-neutral-800",
    border: "border-neutral-300 dark:border-neutral-600",
    text: "text-neutral-700 dark:text-neutral-300",
    description: "Meets EN 301 549 requirements",
  },
  bronze: {
    label: "Bronze",
    color: "from-orange-400 to-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-700 dark:text-orange-300",
    description: "Partially meets EN 301 549",
  },
  "in-progress": {
    label: "In Progress",
    color: "from-neutral-400 to-neutral-500",
    bg: "bg-neutral-50 dark:bg-neutral-800",
    border: "border-neutral-200 dark:border-neutral-700",
    text: "text-neutral-600 dark:text-neutral-400",
    description: "Working towards compliance",
  },
};

export default function CertificatePage() {
  const params = useParams();
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/certificate/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setCert)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">Loading certificate...</div>
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Certificate Not Found</h1>
          <p className="text-sm text-neutral-500 mt-2">This certificate does not exist or has expired.</p>
        </div>
      </div>
    );
  }

  const config = levelConfig[cert.level];
  const isExpired = new Date(cert.expiresAt) < new Date();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Certificate Card */}
        <div className={`rounded-2xl border-2 ${config.border} bg-white dark:bg-neutral-900 overflow-hidden shadow-lg`}>
          {/* Header Gradient */}
          <div className={`h-2 bg-linear-to-r ${config.color}`} />
          
          <div className="p-8 text-center">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="rounded-full bg-neutral-900 dark:bg-white p-3">
                <Shield className="h-8 w-8 text-white dark:text-neutral-900" />
              </div>
            </div>

            <h1 className="text-sm font-medium tracking-widest uppercase text-neutral-500 dark:text-neutral-400 mb-2">
              Certificate of Accessibility Compliance
            </h1>

            <div className="my-6">
              <Award className={`h-16 w-16 mx-auto ${config.text}`} />
              <p className={`mt-2 text-2xl font-bold ${config.text}`}>{config.label} Level</p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{config.description}</p>
            </div>

            {/* Score */}
            <div className="inline-flex items-center gap-2 rounded-full bg-neutral-100 dark:bg-neutral-800 px-4 py-2 mb-6">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-lg font-bold text-neutral-900 dark:text-white">{cert.score}%</span>
              <span className="text-sm text-neutral-500">compliance score</span>
            </div>

            {/* Details */}
            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-6 mt-6 space-y-4">
              <div className="flex items-center justify-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-neutral-400" />
                <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                  {cert.url} <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                <div className={`rounded-lg ${config.bg} p-3`}>
                  <p className="text-neutral-500 dark:text-neutral-400 text-xs">Standard</p>
                  <p className="font-medium text-neutral-900 dark:text-white">{cert.standard}</p>
                </div>
                <div className={`rounded-lg ${config.bg} p-3`}>
                  <p className="text-neutral-500 dark:text-neutral-400 text-xs">WCAG Level</p>
                  <p className="font-medium text-neutral-900 dark:text-white">{cert.wcagLevel}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs mt-4">
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2 text-center">
                  <p className="font-bold text-red-700 dark:text-red-300">{cert.violations.critical}</p>
                  <p className="text-red-600 dark:text-red-400">Critical</p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2 text-center">
                  <p className="font-bold text-orange-700 dark:text-orange-300">{cert.violations.serious}</p>
                  <p className="text-orange-600 dark:text-orange-400">Serious</p>
                </div>
                <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 p-2 text-center">
                  <p className="font-bold text-yellow-700 dark:text-yellow-300">{cert.violations.moderate}</p>
                  <p className="text-yellow-600 dark:text-yellow-400">Moderate</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2 text-center">
                  <p className="font-bold text-blue-700 dark:text-blue-300">{cert.violations.minor}</p>
                  <p className="text-blue-600 dark:text-blue-400">Minor</p>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-400 mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Issued: {new Date(cert.issuedAt).toLocaleDateString()}
                </span>
                <span className={`flex items-center gap-1 ${isExpired ? "text-red-500" : ""}`}>
                  <Calendar className="h-3 w-3" />
                  {isExpired ? "Expired" : "Expires"}: {new Date(cert.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Verification */}
            <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800">
              <p className="text-xs text-neutral-400">
                Certificate ID: <code className="font-mono">{cert.id}</code>
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Verified by <a href="https://reglayer.vercel.app" className="text-blue-600 hover:underline">RegLayer</a> — European Accessibility Act Compliance Platform
              </p>
              {isExpired && (
                <p className="text-xs text-red-500 font-medium mt-2">
                  ⚠ This certificate has expired. Please run a new scan to renew.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
