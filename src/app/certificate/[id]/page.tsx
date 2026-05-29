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
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
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
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 py-6 px-4 flex flex-col">
      <div className="mx-auto max-w-2xl w-full flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-4 print:hidden">
          <a href={`/report/${params.id}`} className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
            ← Back to Report
          </a>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {downloading ? "Generating..." : "Download PDF"}
          </button>
        </div>

        {/* Certificate Card */}
        <div ref={certRef} className={`relative rounded-xl border ${config.border} bg-white dark:bg-neutral-900 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.06),0_12px_40px_rgba(0,0,0,0.04)]`}>
          {/* Top Gradient Bar */}
          <div className={`h-1 bg-gradient-to-r ${config.color}`} />
          
          {/* Decorative corner patterns */}
          <div className="absolute top-5 left-5 w-10 h-10 border-t border-l border-neutral-200/60 dark:border-neutral-700/40 rounded-tl" />
          <div className="absolute top-5 right-5 w-10 h-10 border-t border-r border-neutral-200/60 dark:border-neutral-700/40 rounded-tr" />
          <div className="absolute bottom-5 left-5 w-10 h-10 border-b border-l border-neutral-200/60 dark:border-neutral-700/40 rounded-bl" />
          <div className="absolute bottom-5 right-5 w-10 h-10 border-b border-r border-neutral-200/60 dark:border-neutral-700/40 rounded-br" />
          
          <div className="relative px-8 py-7 sm:px-12 sm:py-8 text-center">
            {/* Header */}
            <div className="flex items-center justify-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-neutral-900 dark:text-white" />
              <p className="text-[9px] font-semibold tracking-[0.25em] uppercase text-neutral-400 dark:text-neutral-500">
                RegLayer Verified
              </p>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white tracking-tight">
              Certificate of Accessibility Compliance
            </h1>

            {/* Score + Level Row */}
            <div className="mt-5 flex items-center justify-center gap-6">
              {/* Score Circle */}
              <div className="relative shrink-0">
                <svg width="72" height="72" viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" strokeWidth="5" className="text-neutral-100 dark:text-neutral-800" />
                  <circle
                    cx="36" cy="36" r="30"
                    fill="none"
                    stroke={cert.score >= 90 ? "#16a34a" : cert.score >= 70 ? "#ca8a04" : "#dc2626"}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${(cert.score / 100) * 188} 188`}
                    transform="rotate(-90 36 36)"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black text-neutral-900 dark:text-white">{cert.score}%</span>
                </div>
              </div>

              {/* Level Badge */}
              <div className={`rounded-xl ${config.bg} px-5 py-3 border ${config.border} text-center`}>
                <Award className={`h-7 w-7 ${config.text} mx-auto`} />
                <p className={`text-sm font-bold ${config.text} mt-1`}>{config.label}</p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{config.description}</p>
              </div>
            </div>

            {/* URL */}
            <div className="flex items-center justify-center gap-1.5 text-xs mt-4">
              <Globe className="h-3 w-3 text-neutral-400" />
              <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors truncate max-w-[300px]">
                {cert.url}
              </a>
              <ExternalLink className="h-2.5 w-2.5 text-neutral-400" />
            </div>

            {/* Details + Violations inline */}
            <div className="mt-5 grid grid-cols-2 gap-2 max-w-xs mx-auto text-xs">
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/40 px-3 py-2 text-center">
                <p className="text-[9px] font-medium text-neutral-400 uppercase tracking-wider">Standard</p>
                <p className="font-bold text-neutral-900 dark:text-white text-[13px]">{cert.standard}</p>
              </div>
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/40 px-3 py-2 text-center">
                <p className="text-[9px] font-medium text-neutral-400 uppercase tracking-wider">WCAG Level</p>
                <p className="font-bold text-neutral-900 dark:text-white text-[13px]">{cert.wcagLevel}</p>
              </div>
            </div>

            {/* Violations Summary - compact */}
            <div className="flex items-center justify-center gap-3 mt-4 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <span className="text-neutral-500">{cert.violations.critical} critical</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <span className="text-neutral-500">{cert.violations.serious} serious</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                <span className="text-neutral-500">{cert.violations.moderate} moderate</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span className="text-neutral-500">{cert.violations.minor} minor</span>
              </span>
            </div>

            {/* Dates + ID footer */}
            <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center justify-center gap-5 text-[11px] text-neutral-400 dark:text-neutral-500">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Issued {new Date(cert.issuedAt).toLocaleDateString()}
                </span>
                <span className={`flex items-center gap-1 ${isExpired ? "text-red-500" : ""}`}>
                  <Calendar className="h-3 w-3" />
                  {isExpired ? "Expired" : "Valid until"} {new Date(cert.expiresAt).toLocaleDateString()}
                </span>
              </div>
              {isExpired && (
                <p className="text-[11px] text-red-500 font-medium mt-2">
                  This certificate has expired. Run a new scan to renew.
                </p>
              )}
              <p className="text-[9px] text-neutral-300 dark:text-neutral-600 font-mono mt-2">{cert.id}</p>
              <p className="text-[9px] text-neutral-400 mt-0.5">
                Verified by <a href="https://reglayer.vercel.app" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">RegLayer</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
