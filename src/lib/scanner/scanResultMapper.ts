/**
 * RegLayer — Prisma Scan → ScanResult mapper (PURE, testable)
 *
 * WHY: The scan detail page (and report/PDF/compare views) consume the rich
 * `ScanResult` shape produced by the scan pipeline (scan.summary, scan.timestamp,
 * scan.metadata.scanDuration, violations with wcagTags/nodes). But a DB-backed
 * scan is a flat Prisma row (score/critical/… columns, `tags`/`affectedElements`,
 * `duration`, `createdAt`). Returning the raw row made the detail page render
 * `new Date(undefined)`, `undefinedms`, and crash on a null `compliance`.
 *
 * This mapper inverts persistScan's forward mapping so the API returns the SAME
 * shape as the in-memory store path — one source of truth, fully unit-tested.
 */

import type { Scan, Violation } from "@/generated/prisma/client";
import type {
  ScanResult,
  AccessibilityViolation,
  ViolationNode,
  ViolationImpact,
  ScanStatus,
} from "@/lib/types";
import { scoreFromStoredViolations } from "@/lib/scoring/reportScore";

type ScanWithViolations = Scan & { violations: Violation[] };

function toNodes(affected: unknown): ViolationNode[] {
  if (!Array.isArray(affected)) return [];
  return affected.map((n) => {
    const o = (n ?? {}) as Record<string, unknown>;
    return {
      html: typeof o.html === "string" ? o.html : "",
      target: Array.isArray(o.target) ? (o.target as string[]) : [],
      failureSummary: typeof o.failureSummary === "string" ? o.failureSummary : "",
    };
  });
}

export function mapViolation(v: Violation): AccessibilityViolation {
  return {
    // The pipeline/store path uses the axe RULE id here (e.g. "color-contrast").
    id: v.ruleId,
    impact: v.impact as ViolationImpact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl ?? "",
    wcagTags: Array.isArray(v.tags) ? v.tags : [],
    nodes: toNodes(v.affectedElements),
  };
}

export function mapPrismaScanToResult(scan: ScanWithViolations): ScanResult {
  const meta = (scan.metadata ?? {}) as Record<string, unknown>;
  const when = scan.completedAt ?? scan.startedAt ?? scan.createdAt;
  return {
    id: scan.id,
    url: scan.url,
    timestamp: (when instanceof Date ? when : new Date(when)).toISOString(),
    status: (scan.status?.toString().toLowerCase() as ScanStatus) ?? "completed",
    summary: {
      totalViolations: scan.totalViolations ?? 0,
      critical: scan.critical ?? 0,
      serious: scan.serious ?? 0,
      moderate: scan.moderate ?? 0,
      minor: scan.minor ?? 0,
      // Recompute from the violations actually shown, via the canonical helper —
      // the same source of truth report/[id], the badge, and the certificate use.
      // Guarantees one scan shows ONE score everywhere, even for legacy rows whose
      // stored `score` predates the current formula.
      score: scoreFromStoredViolations(scan.violations ?? []),
    },
    violations: (scan.violations ?? []).map(mapViolation),
    screenshot: scan.screenshot ?? undefined,
    metadata: {
      scanDuration: scan.duration ?? 0,
      pageTitle: scan.pageTitle ?? "",
      browserEngine: typeof meta.browserEngine === "string" ? meta.browserEngine : "chromium",
      axeCoreVersion: typeof meta.axeCoreVersion === "string" ? meta.axeCoreVersion : "4.x",
      // Carry the Deep Scan report through from the stored metadata JSON so it
      // renders on persisted scans, not just the live result.
      ...(meta.deepScan
        ? { deepScan: meta.deepScan as import("@/lib/scanner/accessibility/deepScan").DeepScanReport }
        : {}),
    },
  };
}
