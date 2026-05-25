/**
 * ---------------------------------------------------------
 * RegLayer — Application Constants
 * ---------------------------------------------------------
 *
 * Purpose:
 * Centralized configuration constants for the platform.
 *
 * Why this exists:
 * Magic strings/numbers scattered through a codebase
 * create maintenance nightmares. Central constants
 * enable single-point configuration changes.
 * ---------------------------------------------------------
 */

export const APP_CONFIG = {
  name: "RegLayer",
  version: "0.1.0",
  description: "Developer-native compliance infrastructure",
} as const;

export const SCAN_DEFAULTS = {
  timeout: 30000,
  waitUntil: "networkidle" as const,
  maxConcurrentScans: 5,
  browserEngine: "chromium",
} as const;

export const SEVERITY_WEIGHTS = {
  critical: 10,
  serious: 7,
  moderate: 4,
  minor: 1,
} as const;

export const WCAG_LEVELS = {
  A: "A",
  AA: "AA",
  AAA: "AAA",
} as const;

export const COMPLIANCE_THRESHOLDS = {
  passing: 90,
  warning: 70,
  failing: 0,
} as const;
