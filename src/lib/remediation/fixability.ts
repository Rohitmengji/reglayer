/**
 * RegLayer — Remediation fixability analysis (pure, testable)
 *
 * WHY: Connect the scanner to the remediation engine — given a scan's violations,
 *      tell the user honestly how many can be fixed AUTOMATICALLY (by the drop-in
 *      script / server remediation) vs how many genuinely need a developer.
 * WHAT: FIXABLE_RULES maps each axe rule the engine ACTUALLY repairs to its fix
 *       category; analyzeFixability() tallies a scan's violations against it.
 * HOW: No React/prisma imports — shared by the UI and unit-tested. The map is
 *      intentionally CONSERVATIVE: a rule is only listed if engine.ts genuinely
 *      applies a fix for it (over-claiming would be a hollow promise).
 */

/** Engine fix categories (must match RemediationConfig / FixRecord.category). */
export type FixCategory =
  | "lang-attribute"
  | "skip-links"
  | "landmarks"
  | "alt-text"
  | "form-labels"
  | "button-labels"
  | "focus-order"
  | "contrast";

/**
 * axe rule id → the engine fix category that repairs it. Only rules the
 * remediation engine (src/lib/remediation/engine.ts) actually fixes are listed.
 */
export const FIXABLE_RULES: Record<string, FixCategory> = {
  // Page language (engine: fixLangAttribute)
  "html-has-lang": "lang-attribute",
  "html-lang-valid": "lang-attribute",
  "html-xml-lang-mismatch": "lang-attribute",
  "valid-lang": "lang-attribute",
  // Skip link (engine: fixSkipLinks)
  bypass: "skip-links",
  "skip-link": "skip-links",
  // Landmark roles/labels (engine: fixLandmarks)
  region: "landmarks",
  "landmark-one-main": "landmarks",
  "landmark-unique": "landmarks",
  "landmark-complementary-is-top-level": "landmarks",
  "landmark-no-duplicate-banner": "landmarks",
  "landmark-no-duplicate-contentinfo": "landmarks",
  "landmark-no-duplicate-main": "landmarks",
  // Image alt (engine: fixAltText)
  "image-alt": "alt-text",
  "input-image-alt": "alt-text",
  "role-img-alt": "alt-text",
  "svg-img-alt": "alt-text",
  "area-alt": "alt-text",
  "object-alt": "alt-text",
  // Form labels (engine: fixFormLabels)
  label: "form-labels",
  "label-title-only": "form-labels",
  "form-field-multiple-labels": "form-labels",
  "select-name": "form-labels",
  // Button names (engine: fixButtonLabels)
  "button-name": "button-labels",
  "input-button-name": "button-labels",
  // Focus order (engine: fixFocusOrder — strips positive tabindex)
  tabindex: "focus-order",
  // Color contrast (engine: fixContrast — off by default, alters design)
  "color-contrast": "contrast",
  "color-contrast-enhanced": "contrast",
};

/**
 * Categories whose fix adds correct MARKUP but whose VALUE still needs a human
 * (e.g. alt text derived from a filename). Surfaced so we never over-promise.
 */
export const REVIEW_CATEGORIES: ReadonlySet<FixCategory> = new Set<FixCategory>([
  "alt-text",
  "form-labels",
  "button-labels",
]);

/** A risky category that can alter visual design (off by default in the engine). */
export const RISKY_CATEGORIES: ReadonlySet<FixCategory> = new Set<FixCategory>(["contrast"]);

export interface ViolationLike {
  /** axe rule id — in the ScanResult shape this is `violation.id`. */
  id?: string | null;
  ruleId?: string | null;
  impact?: string | null;
}

export interface FixabilitySummary {
  total: number;
  autoFixable: number;
  needsReview: number; // subset of autoFixable: markup auto-added, value needs a human
  needsDeveloper: number;
  /** Auto-fixable counts per engine category, sorted by count desc. */
  byCategory: Array<{ category: FixCategory; count: number; review: boolean; risky: boolean }>;
  /** Distinct rules the engine can't fix, sorted by impact then count. */
  needsDeveloperRules: Array<{ ruleId: string; impact: string; count: number }>;
}

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/**
 * Analyze a scan's violations: how many the remediation engine can auto-fix,
 * grouped by category, vs how many need a developer.
 *
 * Each violation row is one axe rule (aggregating its affected elements), so we
 * count rows, not elements.
 */
export function analyzeFixability(violations: ViolationLike[]): FixabilitySummary {
  const byCat = new Map<FixCategory, number>();
  const devRules = new Map<string, { impact: string; count: number }>();
  let autoFixable = 0;
  let needsReview = 0;

  for (const v of violations ?? []) {
    const ruleId = (v.ruleId ?? v.id ?? "").toString();
    if (!ruleId) continue;
    const cat = FIXABLE_RULES[ruleId];
    if (cat) {
      autoFixable += 1;
      byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
      if (REVIEW_CATEGORIES.has(cat)) needsReview += 1;
    } else {
      const impact = (v.impact ?? "minor").toString();
      const existing = devRules.get(ruleId);
      if (existing) existing.count += 1;
      else devRules.set(ruleId, { impact, count: 1 });
    }
  }

  const byCategory = [...byCat.entries()]
    .map(([category, count]) => ({
      category,
      count,
      review: REVIEW_CATEGORIES.has(category),
      risky: RISKY_CATEGORIES.has(category),
    }))
    .sort((a, b) => b.count - a.count);

  const needsDeveloperRules = [...devRules.entries()]
    .map(([ruleId, { impact, count }]) => ({ ruleId, impact, count }))
    .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9) || b.count - a.count);

  const total = autoFixable + needsDeveloperRules.reduce((n, r) => n + r.count, 0);

  return { total, autoFixable, needsReview, needsDeveloper: total - autoFixable, byCategory, needsDeveloperRules };
}
