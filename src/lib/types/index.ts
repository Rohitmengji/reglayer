/**
 * ---------------------------------------------------------
 * RegLayer — Core Type Definitions
 * ---------------------------------------------------------
 *
 * Purpose:
 * Centralized type system for the entire scanning and
 * compliance infrastructure.
 *
 * Why this exists:
 * Strong typing across service boundaries ensures
 * correctness at compile time rather than runtime.
 *
 * Engineering Notes:
 * - All types used across multiple modules live here.
 * - Domain-specific types stay in their respective modules.
 * - Prefer interfaces for objects, types for unions/aliases.
 * ---------------------------------------------------------
 */

export interface ScanRequest {
  url: string;
  options?: ScanOptions;
  userEmail?: string;
}

export interface ScanOptions {
  includeScreenshot?: boolean;
  waitForSelector?: string;
  timeout?: number;
  tags?: string[];
  /** Authentication config for scanning behind-login pages */
  auth?: import("@/lib/validations/auth").AuthConfig;
  /**
   * Deep Scan: after the initial static-DOM pass, reveal interactive states and
   * re-run axe, plus run keyboard-reachability heuristics. Surfaces violations a
   * one-shot scan can't see. Slower — gate behind a paid plan.
   */
  deep?: boolean;
  /** Scan region — simulates scanning from a specific geographic location */
  region?: string;
}

export interface ScanResult {
  id: string;
  url: string;
  timestamp: string;
  status: ScanStatus;
  summary: ScanSummary;
  violations: AccessibilityViolation[];
  screenshot?: string;
  metadata: ScanMetadata;
}

export type ScanStatus = "pending" | "running" | "completed" | "failed";

export interface ScanSummary {
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  score: number;
}

export interface AccessibilityViolation {
  id: string;
  impact: ViolationImpact;
  description: string;
  help: string;
  helpUrl: string;
  wcagTags: string[];
  nodes: ViolationNode[];
}

export type ViolationImpact = "critical" | "serious" | "moderate" | "minor";

export interface ViolationNode {
  html: string;
  target: string[];
  failureSummary: string;
}

export interface ScanMetadata {
  scanDuration: number;
  pageTitle: string;
  browserEngine: string;
  axeCoreVersion: string;
  /** Scan region — which geographic location the scan was run from */
  region?: string;
  /** Deep Scan report (states revealed, keyboard heuristics). Present when deep scan ran. */
  deepScan?: import("@/lib/scanner/accessibility/deepScan").DeepScanReport;
  /** Page-structure snapshot (headings, <html lang>, text sample) for content/structure insights. */
  pageStructure?: import("@/lib/a11y/page-insights").PageStructureCapture;
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  regulation: string;
  wcagCriteria: string[];
  severity: ViolationImpact;
}

export interface ComplianceReport {
  scanId: string;
  timestamp: string;
  overallCompliance: number;
  ruleResults: ComplianceRuleResult[];
}

export interface ComplianceRuleResult {
  rule: ComplianceRule;
  passed: boolean;
  violations: AccessibilityViolation[];
}
