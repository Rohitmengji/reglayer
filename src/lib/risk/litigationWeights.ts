/**
 * RegLayer — Litigation Weight Data (PURE, no server deps)
 *
 * WHY a standalone module:
 * These constants are the credible core of the legal-risk model — the violation
 * types that actually drive ADA Title III web lawsuits, with their lawsuit
 * frequency and average settlement (from published ADA/EAA filing data). They
 * were previously trapped inside the `server-only` legalRiskEngine (which imports
 * Prisma), so nothing pure could reuse them. Extracting them here lets BOTH the
 * server engine AND pure, unit-testable analyzers (e.g. the crawl's site-wide
 * "ADA Litigation Surface") share one source of truth.
 *
 * legalRiskEngine re-exports these for backward compatibility.
 */

export interface LitigationWeightData {
  /** Relative contribution to the litigation score (sums to ~1.0 across rules). */
  weight: number;
  /** Share of filed ADA web lawsuits that cite this issue type (0..1). */
  frequency: number;
  /** Average settlement when this issue type is the/a basis ($). */
  avgSettlement: number;
}

/** The 6 violation types appearing in ~96% of filed ADA web lawsuits. */
export const LITIGATION_WEIGHTS: Record<string, LitigationWeightData> = {
  "image-alt": { weight: 0.22, frequency: 0.67, avgSettlement: 28000 },
  "label": { weight: 0.19, frequency: 0.61, avgSettlement: 25000 },
  "color-contrast": { weight: 0.17, frequency: 0.54, avgSettlement: 22000 },
  "link-name": { weight: 0.15, frequency: 0.48, avgSettlement: 19000 },
  "keyboard": { weight: 0.14, frequency: 0.44, avgSettlement: 31000 },
  "form-field-multiple-labels": { weight: 0.13, frequency: 0.39, avgSettlement: 21000 },
};

export const INDUSTRY_MULTIPLIERS: Record<string, number> = {
  ecommerce: 1.8,
  restaurant: 1.7,
  healthcare: 1.6,
  financial: 1.5,
  education: 1.4,
  government: 1.3,
  hospitality: 1.2,
  saas: 1.1,
  other: 1.0,
};

export const GEO_MULTIPLIERS: Record<string, number> = {
  NY: 1.9,
  FL: 1.7,
  CA: 1.6,
  TX: 1.3,
  EU: 1.8,
  other: 1.0,
};

export const IMPACT_MULTIPLIERS: Record<string, number> = {
  critical: 2.0,
  serious: 1.5,
  moderate: 1.0,
  minor: 0.5,
};

/**
 * Human-readable context for each litigation-driving rule — the plain-English
 * label, the WCAG criterion, and WHY plaintiffs' firms cite it. Used by the
 * crawl's ADA Litigation Surface card so the analysis reads like a lawyer's
 * exposure brief, not a raw axe rule dump.
 */
export const LITIGATION_RULE_INFO: Record<
  string,
  { label: string; wcag: string; plaintiffNote: string }
> = {
  "image-alt": {
    label: "Images without alt text",
    wcag: "WCAG 1.1.1 (Level A)",
    plaintiffNote:
      "Screen-reader users can't perceive the image — the single most-cited failure in ADA web demand letters.",
  },
  label: {
    label: "Form fields without labels",
    wcag: "WCAG 1.3.1 / 4.1.2 (Level A)",
    plaintiffNote:
      "Unlabeled inputs block screen-reader users from completing forms, sign-up, and checkout.",
  },
  "color-contrast": {
    label: "Insufficient color contrast",
    wcag: "WCAG 1.4.3 (Level AA)",
    plaintiffNote:
      "Low-contrast text is unreadable for low-vision users — trivially provable in a screenshot.",
  },
  "link-name": {
    label: "Links without discernible text",
    wcag: "WCAG 2.4.4 / 4.1.2 (Level A)",
    plaintiffNote:
      "Empty or “click here” links give screen-reader users no destination — a staple of serial filings.",
  },
  keyboard: {
    label: "Keyboard-inaccessible controls",
    wcag: "WCAG 2.1.1 (Level A)",
    plaintiffNote:
      "Controls that need a mouse exclude keyboard-only and switch-device users entirely.",
  },
  "form-field-multiple-labels": {
    label: "Form fields with conflicting labels",
    wcag: "WCAG 3.3.2 (Level A)",
    plaintiffNote:
      "Ambiguous or duplicated labels mislead assistive technology and are cited as confusion failures.",
  },
};

/**
 * Approximate raw-score ceiling used to normalize the per-scan engine's
 * count-weighted score to 0–100. Kept here so the engine and any future analyzer
 * normalize against the same constant.
 */
export const RAW_SCORE_CEILING = 50;

/** Settlement-probability factor applied to average settlements ($). */
export const SETTLEMENT_PROBABILITY = 0.15;

/**
 * Upper bound on a reported legal-exposure estimate. Both the per-scan risk
 * engine and the crawl's litigation surface clamp to this, so a site with more
 * exposure still shows this ceiling — format it with a trailing "+" so it reads
 * as a floor, not a precise computed figure.
 */
export const EXPOSURE_CAP = 500_000;

/** Format an estimated $ exposure, marking the capped ceiling as "$500,000+". */
export function formatExposure(n: number): string {
  const v = Math.round(n || 0);
  return v >= EXPOSURE_CAP ? `$${EXPOSURE_CAP.toLocaleString()}+` : `$${v.toLocaleString()}`;
}
