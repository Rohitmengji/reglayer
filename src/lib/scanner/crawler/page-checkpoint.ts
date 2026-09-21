import { createHash } from "node:crypto";
import { z } from "zod";
import type { ScanResult } from "@/lib/types";

export interface CrawlAttempt {
  token: string;
  generation: number;
}

export interface CrawlJobScope {
  workspaceId: string;
  jobId: string;
  attempt?: CrawlAttempt;
}

export interface CrawlPageScope extends CrawlJobScope {
  url: string;
}

export function crawlPageKey(scope: CrawlPageScope): string {
  if (!scope.workspaceId.trim() || !scope.jobId.trim()) throw new Error("Crawl page scope is required.");
  const url = new URL(scope.url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Crawl pages require an HTTP(S) URL without embedded credentials.");
  }
  const identity = JSON.stringify(["crawl-page-v1", scope.workspaceId, scope.jobId, url.href]);
  return `crawl_page_${createHash("sha256").update(identity).digest("hex")}`;
}

const snapshotSchema = z.object({
  version: z.literal(1),
  scan: z.object({
    id: z.string().min(1),
    url: z.string().url(),
    timestamp: z.string().datetime(),
    status: z.literal("completed"),
    summary: z.object({
      totalViolations: z.number().int().nonnegative(),
      critical: z.number().int().nonnegative(), serious: z.number().int().nonnegative(),
      moderate: z.number().int().nonnegative(), minor: z.number().int().nonnegative(),
      score: z.number().min(0).max(100),
    }),
    violations: z.array(z.object({
      id: z.string(), impact: z.enum(["critical", "serious", "moderate", "minor"]),
      description: z.string(), help: z.string(), helpUrl: z.string(), wcagTags: z.array(z.string()),
      nodes: z.array(z.object({ html: z.string(), target: z.array(z.string()), failureSummary: z.string() })),
    })),
    metadata: z.looseObject({
      scanDuration: z.number().int().nonnegative(), pageTitle: z.string(),
      browserEngine: z.string(), axeCoreVersion: z.string(), region: z.string().optional(),
    }),
  }),
});

export function pageSnapshot(scan: ScanResult) {
  return snapshotSchema.parse({ version: 1, scan });
}

export function restorePageSnapshot(snapshot: unknown, scanId: string, screenshot: string | null): ScanResult {
  const parsed = snapshotSchema.parse(snapshot);
  if (parsed.scan.id !== scanId) throw new Error("Checkpoint scan identity does not match its saved scan.");
  return { ...parsed.scan, screenshot: screenshot ?? undefined };
}