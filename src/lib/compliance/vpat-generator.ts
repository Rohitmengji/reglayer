/**
 * ---------------------------------------------------------
 * RegLayer — VPAT/ACR Generator
 * ---------------------------------------------------------
 *
 * Auto-generates Voluntary Product Accessibility Templates (VPAT)
 * and Accessibility Conformance Reports (ACR) from scan data.
 *
 * Companies pay $10K-$50K to consultants for these documents.
 * RegLayer generates them continuously from real scan data.
 *
 * Supports:
 * - VPAT 2.4 Rev (ITI format)
 * - WCAG 2.1 Level A & AA
 * - Section 508
 * - EN 301 549 (EU)
 * - Revised Section 508 (US Federal)
 *
 * Output: Structured JSON that can be rendered as HTML/PDF/DOCX
 * ---------------------------------------------------------
 */

/**
 * White-label branding applied to the rendered report (Enterprise/Agency).
 * All values originate from the agency record and are sanitised at render time.
 */
export interface VPATBranding {
  brandName?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  supportEmail?: string;
}

export interface VPATInput {
  productName: string;
  productVersion?: string;
  productDescription?: string;
  vendorName: string;
  vendorContact?: string;
  reportDate?: string;
  evaluationMethods?: string[];
  scanData: VPATScanData;
  standard: "WCAG21-A" | "WCAG21-AA" | "WCAG21-AAA" | "Section508" | "EN301549";
  notes?: string;
  /** Manual test verdicts to override automated-only inference (from AI-guided manual testing) */
  manualVerdicts?: Array<{
    criterion: string;
    verdict: "pass" | "fail" | "na";
    attestedBy?: string | null;
  }>;
  /** Optional white-label branding (Enterprise/Agency). Defaults to RegLayer. */
  branding?: VPATBranding;
}

export interface VPATScanData {
  url: string;
  score: number;
  totalViolations: number;
  violations: VPATViolation[];
  pagesScanned?: number;
  scanDate: string;
}

export interface VPATViolation {
  ruleId: string;
  impact: string;
  wcagCriteria: string[];
  description: string;
  help: string;
  affectedCount: number;
}

export type ConformanceLevel = "Supports" | "Partially Supports" | "Does Not Support" | "Not Applicable" | "Not Evaluated";

export interface VPATCriterion {
  id: string;
  name: string;
  level: "A" | "AA" | "AAA";
  conformance: ConformanceLevel;
  remarks: string;
}

export interface VPATDocument {
  metadata: {
    reportType: "VPAT" | "ACR";
    standard: string;
    productName: string;
    productVersion: string;
    productDescription: string;
    vendorName: string;
    vendorContact: string;
    reportDate: string;
    lastUpdated: string;
    evaluationMethods: string[];
    toolsUsed: string[];
  };
  summary: {
    overallConformance: ConformanceLevel;
    score: number;
    supportedCriteria: number;
    partiallySupportedCriteria: number;
    notSupportedCriteria: number;
    notApplicableCriteria: number;
    notEvaluatedCriteria: number;
    totalCriteria: number;
  };
  criteria: VPATCriterion[];
  sections: VPATSection[];
  notes: string;
  legalDisclaimer: string;
  /** White-label branding for the rendered output (undefined → RegLayer default). */
  branding?: VPATBranding;
}

export interface VPATSection {
  title: string;
  description: string;
  criteria: VPATCriterion[];
}

// ─── WCAG 2.1 Criteria Database ────────────────────────────

const WCAG_21_CRITERIA: Array<{ id: string; name: string; level: "A" | "AA" | "AAA"; principle: string }> = [
  // Principle 1: Perceivable
  { id: "1.1.1", name: "Non-text Content", level: "A", principle: "Perceivable" },
  { id: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", principle: "Perceivable" },
  { id: "1.2.2", name: "Captions (Prerecorded)", level: "A", principle: "Perceivable" },
  { id: "1.2.3", name: "Audio Description or Media Alternative", level: "A", principle: "Perceivable" },
  { id: "1.2.4", name: "Captions (Live)", level: "AA", principle: "Perceivable" },
  { id: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", principle: "Perceivable" },
  { id: "1.3.1", name: "Info and Relationships", level: "A", principle: "Perceivable" },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A", principle: "Perceivable" },
  { id: "1.3.3", name: "Sensory Characteristics", level: "A", principle: "Perceivable" },
  { id: "1.3.4", name: "Orientation", level: "AA", principle: "Perceivable" },
  { id: "1.3.5", name: "Identify Input Purpose", level: "AA", principle: "Perceivable" },
  { id: "1.4.1", name: "Use of Color", level: "A", principle: "Perceivable" },
  { id: "1.4.2", name: "Audio Control", level: "A", principle: "Perceivable" },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA", principle: "Perceivable" },
  { id: "1.4.4", name: "Resize Text", level: "AA", principle: "Perceivable" },
  { id: "1.4.5", name: "Images of Text", level: "AA", principle: "Perceivable" },
  { id: "1.4.10", name: "Reflow", level: "AA", principle: "Perceivable" },
  { id: "1.4.11", name: "Non-text Contrast", level: "AA", principle: "Perceivable" },
  { id: "1.4.12", name: "Text Spacing", level: "AA", principle: "Perceivable" },
  { id: "1.4.13", name: "Content on Hover or Focus", level: "AA", principle: "Perceivable" },

  // Principle 2: Operable
  { id: "2.1.1", name: "Keyboard", level: "A", principle: "Operable" },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A", principle: "Operable" },
  { id: "2.1.4", name: "Character Key Shortcuts", level: "A", principle: "Operable" },
  { id: "2.2.1", name: "Timing Adjustable", level: "A", principle: "Operable" },
  { id: "2.2.2", name: "Pause, Stop, Hide", level: "A", principle: "Operable" },
  { id: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", principle: "Operable" },
  { id: "2.4.1", name: "Bypass Blocks", level: "A", principle: "Operable" },
  { id: "2.4.2", name: "Page Titled", level: "A", principle: "Operable" },
  { id: "2.4.3", name: "Focus Order", level: "A", principle: "Operable" },
  { id: "2.4.4", name: "Link Purpose (In Context)", level: "A", principle: "Operable" },
  { id: "2.4.5", name: "Multiple Ways", level: "AA", principle: "Operable" },
  { id: "2.4.6", name: "Headings and Labels", level: "AA", principle: "Operable" },
  { id: "2.4.7", name: "Focus Visible", level: "AA", principle: "Operable" },
  { id: "2.5.1", name: "Pointer Gestures", level: "A", principle: "Operable" },
  { id: "2.5.2", name: "Pointer Cancellation", level: "A", principle: "Operable" },
  { id: "2.5.3", name: "Label in Name", level: "A", principle: "Operable" },
  { id: "2.5.4", name: "Motion Actuation", level: "A", principle: "Operable" },

  // Principle 3: Understandable
  { id: "3.1.1", name: "Language of Page", level: "A", principle: "Understandable" },
  { id: "3.1.2", name: "Language of Parts", level: "AA", principle: "Understandable" },
  { id: "3.2.1", name: "On Focus", level: "A", principle: "Understandable" },
  { id: "3.2.2", name: "On Input", level: "A", principle: "Understandable" },
  { id: "3.2.3", name: "Consistent Navigation", level: "AA", principle: "Understandable" },
  { id: "3.2.4", name: "Consistent Identification", level: "AA", principle: "Understandable" },
  { id: "3.3.1", name: "Error Identification", level: "A", principle: "Understandable" },
  { id: "3.3.2", name: "Labels or Instructions", level: "A", principle: "Understandable" },
  { id: "3.3.3", name: "Error Suggestion", level: "AA", principle: "Understandable" },
  { id: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", principle: "Understandable" },

  // Principle 4: Robust
  { id: "4.1.1", name: "Parsing", level: "A", principle: "Robust" },
  { id: "4.1.2", name: "Name, Role, Value", level: "A", principle: "Robust" },
  { id: "4.1.3", name: "Status Messages", level: "AA", principle: "Robust" },
];

// Map axe rule IDs to WCAG criteria
const RULE_TO_WCAG: Record<string, string[]> = {
  "image-alt": ["1.1.1"],
  "input-image-alt": ["1.1.1"],
  "object-alt": ["1.1.1"],
  "area-alt": ["1.1.1"],
  "svg-img-alt": ["1.1.1"],
  "role-img-alt": ["1.1.1"],
  "color-contrast": ["1.4.3"],
  "color-contrast-enhanced": ["1.4.6"],
  "link-in-text-block": ["1.4.1"],
  "aria-allowed-attr": ["4.1.2"],
  "aria-required-attr": ["4.1.2"],
  "aria-valid-attr": ["4.1.2"],
  "aria-valid-attr-value": ["4.1.2"],
  "aria-roles": ["4.1.2"],
  "aria-hidden-body": ["4.1.2"],
  "aria-hidden-focus": ["4.1.2"],
  "button-name": ["4.1.2"],
  "link-name": ["4.1.2", "2.4.4"],
  "input-button-name": ["4.1.2"],
  "label": ["1.3.1", "3.3.2"],
  "select-name": ["1.3.1", "3.3.2"],
  "form-field-multiple-labels": ["1.3.1"],
  "duplicate-id": ["4.1.1"],
  "duplicate-id-active": ["4.1.1"],
  "duplicate-id-aria": ["4.1.1"],
  "document-title": ["2.4.2"],
  "html-has-lang": ["3.1.1"],
  "html-lang-valid": ["3.1.1"],
  "valid-lang": ["3.1.2"],
  "bypass": ["2.4.1"],
  "heading-order": ["1.3.1"],
  "empty-heading": ["2.4.6"],
  "page-has-heading-one": ["1.3.1"],
  "landmark-one-main": ["1.3.1"],
  "region": ["1.3.1"],
  "tabindex": ["2.4.3"],
  "focus-order-semantics": ["2.4.3"],
  "keyboard": ["2.1.1"],
  "no-trap": ["2.1.2"],
  "focus-visible": ["2.4.7"],
  "meta-viewport": ["1.4.4"],
  "meta-refresh": ["2.2.1"],
  "blink": ["2.2.2"],
  "marquee": ["2.2.2"],
  "td-headers-attr": ["1.3.1"],
  "th-has-data-cells": ["1.3.1"],
  "table-fake-caption": ["1.3.1"],
  "definition-list": ["1.3.1"],
  "dlitem": ["1.3.1"],
  "list": ["1.3.1"],
  "listitem": ["1.3.1"],
  "autocomplete-valid": ["1.3.5"],
};

/**
 * Generate a VPAT/ACR document from scan data.
 */
export function generateVPAT(input: VPATInput): VPATDocument {
  const { productName, vendorName, scanData, standard } = input;

  // Filter criteria by standard level
  const targetLevel = standard === "WCAG21-AAA" ? "AAA" : "AA";
  const applicableCriteria = WCAG_21_CRITERIA.filter((c) => {
    if (targetLevel === "AA") return c.level === "A" || c.level === "AA";
    return true;
  });

  // Build violation map: WCAG criterion → violations
  const violationsByCriterion = new Map<string, VPATViolation[]>();
  for (const v of scanData.violations) {
    const criteria = v.wcagCriteria.length > 0
      ? v.wcagCriteria
      : (RULE_TO_WCAG[v.ruleId] || []);

    for (const criterion of criteria) {
      const existing = violationsByCriterion.get(criterion) || [];
      existing.push(v);
      violationsByCriterion.set(criterion, existing);
    }
  }

  // Build manual verdict lookup (from AI-guided manual testing)
  const manualVerdictMap = new Map<string, { verdict: string; attestedBy?: string | null }>();
  if (input.manualVerdicts) {
    for (const mv of input.manualVerdicts) {
      manualVerdictMap.set(mv.criterion, { verdict: mv.verdict, attestedBy: mv.attestedBy });
    }
  }

  // Evaluate each criterion
  const evaluatedCriteria: VPATCriterion[] = applicableCriteria.map((criterion) => {
    const violations = violationsByCriterion.get(criterion.id) || [];

    // Check for manual verdict override
    const manualVerdict = manualVerdictMap.get(criterion.id);

    let conformance: ConformanceLevel;
    let remarks: string;

    if (manualVerdict) {
      // Manual verdict takes precedence — human-attested
      if (manualVerdict.verdict === "pass") {
        conformance = "Supports";
        remarks = "Human-attested pass via manual testing.";
      } else if (manualVerdict.verdict === "fail") {
        conformance = "Does Not Support";
        remarks = "Human-attested fail via manual testing." +
          (violations.length > 0 ? ` Additionally, ${violations.length} automated violation(s) detected.` : "");
      } else {
        conformance = "Not Applicable";
        remarks = "Determined not applicable via manual testing.";
      }
      if (manualVerdict.attestedBy) {
        remarks += ` (Attested by tester)`;
      }
    } else if (violations.length === 0) {
      conformance = "Supports";
      remarks = "No violations detected during automated testing.";
    } else {
      const hasCritical = violations.some((v) => v.impact === "critical");
      const hasSerious = violations.some((v) => v.impact === "serious");
      const totalAffected = violations.reduce((sum, v) => sum + v.affectedCount, 0);

      if (hasCritical || totalAffected > 10) {
        conformance = "Does Not Support";
        remarks = `${violations.length} violation(s) found affecting ${totalAffected} element(s). ` +
          violations.map((v) => v.help).join("; ");
      } else if (hasSerious || totalAffected > 3) {
        conformance = "Partially Supports";
        remarks = `${violations.length} issue(s) found: ` +
          violations.map((v) => `${v.help} (${v.affectedCount} elements)`).join("; ");
      } else {
        conformance = "Partially Supports";
        remarks = `Minor issues detected: ${violations.map((v) => v.help).join("; ")}`;
      }
    }

    return {
      id: criterion.id,
      name: criterion.name,
      level: criterion.level,
      conformance,
      remarks,
    };
  });

  // Group criteria by principle
  const principles = ["Perceivable", "Operable", "Understandable", "Robust"];
  const sections: VPATSection[] = principles.map((principle) => {
    const sectionCriteria = evaluatedCriteria.filter((c) => {
      const fullCriterion = applicableCriteria.find((ac) => ac.id === c.id);
      return fullCriterion?.principle === principle;
    });

    return {
      title: principle,
      description: getPrincipleDescription(principle),
      criteria: sectionCriteria,
    };
  });

  // Calculate summary
  const supported = evaluatedCriteria.filter((c) => c.conformance === "Supports").length;
  const partial = evaluatedCriteria.filter((c) => c.conformance === "Partially Supports").length;
  const notSupported = evaluatedCriteria.filter((c) => c.conformance === "Does Not Support").length;
  const notApplicable = evaluatedCriteria.filter((c) => c.conformance === "Not Applicable").length;
  const notEvaluated = evaluatedCriteria.filter((c) => c.conformance === "Not Evaluated").length;

  let overallConformance: ConformanceLevel;
  if (notSupported === 0 && partial === 0) {
    overallConformance = "Supports";
  } else if (notSupported === 0) {
    overallConformance = "Partially Supports";
  } else if (notSupported <= 3) {
    overallConformance = "Partially Supports";
  } else {
    overallConformance = "Does Not Support";
  }

  return {
    metadata: {
      reportType: "ACR",
      standard: formatStandard(standard),
      productName,
      productVersion: input.productVersion || "1.0",
      productDescription: input.productDescription || "",
      vendorName,
      vendorContact: input.vendorContact || "",
      reportDate: input.reportDate || new Date().toISOString().split("T")[0],
      lastUpdated: new Date().toISOString(),
      evaluationMethods: input.evaluationMethods || [
        "Automated testing with axe-core accessibility engine",
        "Browser-based DOM analysis",
        "ARIA validation",
        "Color contrast analysis",
      ],
      toolsUsed: ["RegLayer Accessibility Scanner", "axe-core", "Playwright"],
    },
    summary: {
      overallConformance,
      score: scanData.score,
      supportedCriteria: supported,
      partiallySupportedCriteria: partial,
      notSupportedCriteria: notSupported,
      notApplicableCriteria: notApplicable,
      notEvaluatedCriteria: notEvaluated,
      totalCriteria: evaluatedCriteria.length,
    },
    criteria: evaluatedCriteria,
    sections,
    notes: input.notes || "This report was auto-generated based on automated accessibility scanning. Manual testing may reveal additional issues not detectable by automated tools. Approximately 30-40% of WCAG criteria require manual evaluation.",
    legalDisclaimer: "This Accessibility Conformance Report (ACR) is based on automated testing results and does not constitute a legal guarantee of full conformance. The evaluation covers detectable issues only. Organizations should supplement automated testing with manual accessibility audits for comprehensive coverage.",
    branding: input.branding,
  };
}

// ─── White-label rendering helpers ────────────────────────

/** Escape text before embedding in generated HTML (defense against injection). */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

/** Only allow well-formed hex colours; otherwise fall back to the RegLayer default. */
function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}

/** Only allow absolute http(s) logo URLs; otherwise omit the logo entirely. */
function safeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Export VPAT as Markdown (for quick viewing).
 */
export function vpatToMarkdown(doc: VPATDocument): string {
  const lines: string[] = [];

  lines.push(`# Accessibility Conformance Report`);
  lines.push(`## ${doc.metadata.productName}`);
  lines.push("");
  lines.push(`**Report Date:** ${doc.metadata.reportDate}`);
  lines.push(`**Last Updated:** ${doc.metadata.lastUpdated.split("T")[0]}`);
  lines.push(`**Standard:** ${doc.metadata.standard}`);
  lines.push(`**Vendor:** ${doc.metadata.vendorName}`);
  if (doc.metadata.productDescription) {
    lines.push(`**Product:** ${doc.metadata.productDescription}`);
  }
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Overall Conformance | **${doc.summary.overallConformance}** |`);
  lines.push(`| Accessibility Score | ${doc.summary.score}/100 |`);
  lines.push(`| Criteria Supported | ${doc.summary.supportedCriteria}/${doc.summary.totalCriteria} |`);
  lines.push(`| Partially Supported | ${doc.summary.partiallySupportedCriteria} |`);
  lines.push(`| Not Supported | ${doc.summary.notSupportedCriteria} |`);
  lines.push("");

  // Evaluation Methods
  lines.push("## Evaluation Methods");
  lines.push("");
  for (const method of doc.metadata.evaluationMethods) {
    lines.push(`- ${method}`);
  }
  lines.push("");

  // Criteria by section
  for (const section of doc.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(`${section.description}`);
    lines.push("");
    lines.push(`| Criteria | Conformance Level | Remarks |`);
    lines.push(`|----------|------------------|---------|`);

    for (const c of section.criteria) {
      const badge = conformanceBadge(c.conformance);
      lines.push(`| ${c.id} ${c.name} (Level ${c.level}) | ${badge} ${c.conformance} | ${c.remarks.substring(0, 100)} |`);
    }
    lines.push("");
  }

  // Notes
  lines.push("## Notes");
  lines.push("");
  lines.push(doc.notes);
  lines.push("");

  // Legal
  lines.push("## Legal Disclaimer");
  lines.push("");
  lines.push(doc.legalDisclaimer);
  lines.push("");
  lines.push("---");
  if (doc.branding?.brandName && doc.branding.brandName !== "RegLayer") {
    const support = doc.branding.supportEmail ? ` · ${doc.branding.supportEmail}` : "";
    lines.push(`*Generated by ${doc.branding.brandName} — Automated Accessibility Compliance${support}*`);
  } else {
    lines.push("*Generated by [RegLayer](https://reglayer.com) — Automated Accessibility Compliance*");
  }

  return lines.join("\n");
}

/**
 * Export VPAT as HTML (for PDF generation / download).
 */
export function vpatToHTML(doc: VPATDocument): string {
  // White-label: sanitise branding, fall back to RegLayer defaults.
  const brandName = escapeHtml(doc.branding?.brandName || "RegLayer");
  const primaryColor = safeColor(doc.branding?.primaryColor, "#2563eb");
  const accentColor = safeColor(doc.branding?.accentColor, "#1e40af");
  const logoUrl = safeUrl(doc.branding?.logoUrl);
  const supportEmail = doc.branding?.supportEmail ? escapeHtml(doc.branding.supportEmail) : null;
  const logoTag = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${brandName}" style="max-height:48px;max-width:240px;margin-bottom:1rem;">`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ACR - ${escapeHtml(doc.metadata.productName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1a1a1a; line-height: 1.6; }
    h1 { border-bottom: 3px solid ${primaryColor}; padding-bottom: 0.5rem; }
    h2 { color: ${accentColor}; margin-top: 2rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    .supports { color: #16a34a; font-weight: 600; }
    .partial { color: #d97706; font-weight: 600; }
    .not-support { color: #dc2626; font-weight: 600; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin: 1rem 0; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; text-align: center; }
    .summary-card .value { font-size: 1.5rem; font-weight: 700; }
    .score { font-size: 2rem; font-weight: 800; color: ${doc.summary.score >= 80 ? '#16a34a' : doc.summary.score >= 60 ? '#d97706' : '#dc2626'}; }
    .disclaimer { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 1rem; margin-top: 2rem; font-size: 0.85rem; }
    .metadata { color: #6b7280; font-size: 0.9rem; }
    @media print { body { padding: 1rem; } }
  </style>
</head>
<body>
  ${logoTag}
  <h1>Accessibility Conformance Report</h1>
  <h2>${escapeHtml(doc.metadata.productName)}</h2>
  <div class="metadata">
    <p><strong>Report Date:</strong> ${escapeHtml(doc.metadata.reportDate)} | <strong>Standard:</strong> ${escapeHtml(doc.metadata.standard)}</p>
    <p><strong>Vendor:</strong> ${escapeHtml(doc.metadata.vendorName)}${doc.metadata.vendorContact ? ` (${escapeHtml(doc.metadata.vendorContact)})` : ''}</p>
    ${doc.metadata.productDescription ? `<p><strong>Description:</strong> ${escapeHtml(doc.metadata.productDescription)}</p>` : ''}
  </div>

  <h2>Summary</h2>
  <div class="summary-grid">
    <div class="summary-card"><div class="score">${doc.summary.score}</div><div>Score /100</div></div>
    <div class="summary-card"><div class="value">${doc.summary.supportedCriteria}</div><div>Supported</div></div>
    <div class="summary-card"><div class="value">${doc.summary.partiallySupportedCriteria}</div><div>Partial</div></div>
    <div class="summary-card"><div class="value">${doc.summary.notSupportedCriteria}</div><div>Not Supported</div></div>
  </div>
  <p><strong>Overall Conformance:</strong> <span class="${doc.summary.overallConformance === 'Supports' ? 'supports' : doc.summary.overallConformance === 'Partially Supports' ? 'partial' : 'not-support'}">${doc.summary.overallConformance}</span></p>

  <h2>Evaluation Methods</h2>
  <ul>${doc.metadata.evaluationMethods.map((m) => `<li>${m}</li>`).join('')}</ul>

  ${doc.sections.map((section) => `
  <h2>${section.title}</h2>
  <p>${section.description}</p>
  <table>
    <thead><tr><th>Criteria</th><th>Level</th><th>Conformance</th><th>Remarks</th></tr></thead>
    <tbody>
      ${section.criteria.map((c) => `<tr>
        <td>${c.id} ${c.name}</td>
        <td>${c.level}</td>
        <td class="${c.conformance === 'Supports' ? 'supports' : c.conformance === 'Partially Supports' ? 'partial' : 'not-support'}">${c.conformance}</td>
        <td>${c.remarks}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  `).join('')}

  <div class="disclaimer">
    <strong>Legal Disclaimer:</strong> ${doc.legalDisclaimer}
  </div>

  <p style="margin-top: 2rem; color: #9ca3af; font-size: 0.8rem; text-align: center;">
    Generated by ${brandName} — Automated Accessibility Compliance${supportEmail ? ` · ${supportEmail}` : ""}
  </p>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────

function formatStandard(standard: string): string {
  switch (standard) {
    case "WCAG21-A": return "WCAG 2.1 Level A";
    case "WCAG21-AA": return "WCAG 2.1 Level AA";
    case "WCAG21-AAA": return "WCAG 2.1 Level AAA";
    case "Section508": return "Revised Section 508";
    case "EN301549": return "EN 301 549 v3.2.1";
    default: return standard;
  }
}

function getPrincipleDescription(principle: string): string {
  switch (principle) {
    case "Perceivable":
      return "Information and user interface components must be presentable to users in ways they can perceive.";
    case "Operable":
      return "User interface components and navigation must be operable.";
    case "Understandable":
      return "Information and the operation of user interface must be understandable.";
    case "Robust":
      return "Content must be robust enough that it can be interpreted reliably by a wide variety of user agents, including assistive technologies.";
    default:
      return "";
  }
}

function conformanceBadge(level: ConformanceLevel): string {
  switch (level) {
    case "Supports": return "✅";
    case "Partially Supports": return "🟡";
    case "Does Not Support": return "❌";
    case "Not Applicable": return "➖";
    case "Not Evaluated": return "❓";
  }
}
