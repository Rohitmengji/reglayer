"use client";

/**
 * RegLayer — Compliance Certificate Page
 *
 * WHY: Users want a shareable visual certificate proving their accessibility compliance.
 * WHAT: Certificate card with score, date, standard, URL. Downloadable as image. Embeddable badge code.
 * HOW: Fetches scan data by ID. Uses html2canvas for image export. Provides HTML/Markdown embed snippets.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { Shield, Award, ExternalLink, Calendar, Globe, Download, Loader2 } from "lucide-react";

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
  const [downloading, setDownloading] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

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

  const handleDownloadPdf = useCallback(async () => {
    if (!certRef.current || downloading || !cert) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(certRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const yOffset = Math.max(0, (297 - imgHeight) / 2);
      pdf.addImage(imgData, "PNG", 0, yOffset, imgWidth, imgHeight);
      pdf.save(`reglayer-certificate-${cert.id}.pdf`);
    } catch {
      window.print();
    } finally {
      setDownloading(false);
    }
  }, [cert, downloading]);

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
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <a href={`/report/${params.id}`} className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
            ← Back to Report
          </a>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Generating..." : "Download as PDF"}
          </button>
        </div>

        {/* Certificate Card */}
        <div ref={certRef} className={`relative rounded-2xl border-2 ${config.border} bg-white dark:bg-neutral-900 overflow-hidden shadow-xl`}>
          {/* Top Gradient Bar */}
          <div className={`h-1.5 bg-linear-to-r ${config.color}`} />
          
          {/* Decorative corner patterns */}
          <div className="absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-neutral-200/50 dark:border-neutral-700/50 rounded-tl-lg" />
          <div className="absolute top-6 right-6 w-16 h-16 border-t-2 border-r-2 border-neutral-200/50 dark:border-neutral-700/50 rounded-tr-lg" />
          <div className="absolute bottom-6 left-6 w-16 h-16 border-b-2 border-l-2 border-neutral-200/50 dark:border-neutral-700/50 rounded-bl-lg" />
          <div className="absolute bottom-6 right-6 w-16 h-16 border-b-2 border-r-2 border-neutral-200/50 dark:border-neutral-700/50 rounded-br-lg" />
          
          <div className="relative p-10 sm:p-12 text-center">
            {/* Logo */}
            <div className="flex justify-center mb-3">
              <div className="rounded-full bg-neutral-900 dark:bg-white p-3 shadow-lg">
                <Shield className="h-7 w-7 text-white dark:text-neutral-900" />
              </div>
            </div>

            <p className="text-[10px] font-semibold tracking-[0.3em] uppercase text-neutral-400 dark:text-neutral-500 mb-1">
              RegLayer Verified
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
              Certificate of Accessibility Compliance
            </h1>

            {/* Level Badge */}
            <div className="mt-8 mb-6">
              <div className={`inline-flex flex-col items-center gap-2 rounded-2xl ${config.bg} px-8 py-5 border ${config.border}`}>
                <Award className={`h-12 w-12 ${config.text}`} />
                <p className={`text-xl font-bold ${config.text}`}>{config.label} Level</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{config.description}</p>
              </div>
            </div>

            {/* Score Circle */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-neutral-100 dark:text-neutral-800" />
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke={cert.score >= 90 ? "#16a34a" : cert.score >= 70 ? "#ca8a04" : "#dc2626"}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(cert.score / 100) * 264} 264`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-neutral-900 dark:text-white">{cert.score}%</span>
                </div>
              </div>
            </div>

            {/* URL */}
            <div className="flex items-center justify-center gap-2 text-sm mb-8">
              <Globe className="h-4 w-4 text-neutral-400" />
              <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium">
                {cert.url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-sm max-w-sm mx-auto">
              <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 p-3 text-center">
                <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">Standard</p>
                <p className="font-bold text-neutral-900 dark:text-white mt-0.5">{cert.standard}</p>
              </div>
              <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/50 p-3 text-center">
                <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">WCAG Level</p>
                <p className="font-bold text-neutral-900 dark:text-white mt-0.5">{cert.wcagLevel}</p>
              </div>
            </div>

            {/* Violations Summary */}
            <div className="grid grid-cols-4 gap-2 text-xs mt-4 max-w-sm mx-auto">
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2.5 text-center">
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{cert.violations.critical}</p>
                <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Critical</p>
              </div>
              <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2.5 text-center">
                <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{cert.violations.serious}</p>
                <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">Serious</p>
              </div>
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 p-2.5 text-center">
                <p className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{cert.violations.moderate}</p>
                <p className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">Moderate</p>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2.5 text-center">
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{cert.violations.minor}</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Minor</p>
              </div>
            </div>

            {/* Dates */}
            <div className="flex items-center justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-400 mt-6 pt-6 border-t border-neutral-100 dark:border-neutral-800">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Issued: {new Date(cert.issuedAt).toLocaleDateString()}
              </span>
              <span className={`flex items-center gap-1.5 ${isExpired ? "text-red-500" : ""}`}>
                <Calendar className="h-3.5 w-3.5" />
                {isExpired ? "Expired" : "Expires"}: {new Date(cert.expiresAt).toLocaleDateString()}
              </span>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-1">
              <p className="text-[10px] text-neutral-400 font-mono">
                ID: {cert.id}
              </p>
              <p className="text-[10px] text-neutral-400">
                Verified by <a href="https://reglayer.vercel.app" className="text-blue-600 dark:text-blue-400 font-medium">RegLayer</a> — Web Accessibility Compliance Platform
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
