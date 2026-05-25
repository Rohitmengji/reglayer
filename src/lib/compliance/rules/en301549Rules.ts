/**
 * ---------------------------------------------------------
 * RegLayer — EN 301 549 Compliance Rules
 * ---------------------------------------------------------
 *
 * Purpose:
 * European standard EN 301 549 V3.2.1 (2021-03) rules
 * referenced by the European Accessibility Act (EAA).
 *
 * EN 301 549 maps closely to WCAG 2.1 Level AA for web
 * content (Chapter 9) but adds additional requirements
 * for ICT products (Chapters 5-13).
 *
 * Why this exists:
 * The EAA (Directive 2019/882) requires products and
 * services to meet accessibility requirements defined
 * in harmonised standard EN 301 549. Organizations
 * selling into the EU market after June 28, 2025 must
 * demonstrate conformance.
 * ---------------------------------------------------------
 */

import type { ComplianceRule } from "@/lib/types";

/**
 * EN 301 549 Chapter 9 — Web Content
 * Maps directly to WCAG 2.1 Level AA success criteria
 */
export const EN_301_549_WEB_RULES: ComplianceRule[] = [
  // Principle 1: Perceivable
  {
    id: "en301549-9.1.1.1",
    name: "Non-text Content",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 Success Criterion 1.1.1 Non-text Content.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.1.1"],
    severity: "serious",
  },
  {
    id: "en301549-9.1.2.1",
    name: "Audio-only and Video-only (Pre-recorded)",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.2.1 Audio-only and Video-only.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.2.1"],
    severity: "serious",
  },
  {
    id: "en301549-9.1.2.2",
    name: "Captions (Pre-recorded)",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.2.2 Captions (Prerecorded).",
    regulation: "EN 301 549",
    wcagCriteria: ["1.2.2"],
    severity: "serious",
  },
  {
    id: "en301549-9.1.2.3",
    name: "Audio Description or Media Alternative",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.2.3.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.2.3"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.2.5",
    name: "Audio Description (Pre-recorded)",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.2.5.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.2.5"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.3.1",
    name: "Info and Relationships",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.3.1 Info and Relationships.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.3.1"],
    severity: "serious",
  },
  {
    id: "en301549-9.1.3.2",
    name: "Meaningful Sequence",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.3.2 Meaningful Sequence.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.3.2"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.3.3",
    name: "Sensory Characteristics",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.3.3.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.3.3"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.3.4",
    name: "Orientation",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.3.4 Orientation.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.3.4"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.3.5",
    name: "Identify Input Purpose",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.3.5.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.3.5"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.4.1",
    name: "Use of Color",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.1 Use of Color.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.1"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.4.2",
    name: "Audio Control",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.2 Audio Control.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.2"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.4.3",
    name: "Contrast (Minimum)",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.3 Contrast (Minimum).",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.3"],
    severity: "serious",
  },
  {
    id: "en301549-9.1.4.4",
    name: "Resize Text",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.4 Resize text.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.4"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.4.5",
    name: "Images of Text",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.5.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.5"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.4.10",
    name: "Reflow",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.10 Reflow.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.10"],
    severity: "serious",
  },
  {
    id: "en301549-9.1.4.11",
    name: "Non-text Contrast",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.11.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.11"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.4.12",
    name: "Text Spacing",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.12 Text Spacing.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.12"],
    severity: "moderate",
  },
  {
    id: "en301549-9.1.4.13",
    name: "Content on Hover or Focus",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 1.4.13.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.13"],
    severity: "moderate",
  },
  // Principle 2: Operable
  {
    id: "en301549-9.2.1.1",
    name: "Keyboard",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.1.1 Keyboard.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.1.1"],
    severity: "critical",
  },
  {
    id: "en301549-9.2.1.2",
    name: "No Keyboard Trap",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.1.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.1.2"],
    severity: "critical",
  },
  {
    id: "en301549-9.2.1.4",
    name: "Character Key Shortcuts",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.1.4.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.1.4"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.2.1",
    name: "Timing Adjustable",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.2.1.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.2.1"],
    severity: "serious",
  },
  {
    id: "en301549-9.2.2.2",
    name: "Pause, Stop, Hide",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.2.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.2.2"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.3.1",
    name: "Three Flashes or Below Threshold",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.3.1.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.3.1"],
    severity: "critical",
  },
  {
    id: "en301549-9.2.4.1",
    name: "Bypass Blocks",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.4.1.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.4.1"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.4.2",
    name: "Page Titled",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.4.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.4.2"],
    severity: "minor",
  },
  {
    id: "en301549-9.2.4.3",
    name: "Focus Order",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.4.3.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.4.3"],
    severity: "serious",
  },
  {
    id: "en301549-9.2.4.4",
    name: "Link Purpose (In Context)",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.4.4.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.4.4"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.4.5",
    name: "Multiple Ways",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.4.5.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.4.5"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.4.6",
    name: "Headings and Labels",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.4.6.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.4.6"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.4.7",
    name: "Focus Visible",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.4.7.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.4.7"],
    severity: "serious",
  },
  {
    id: "en301549-9.2.5.1",
    name: "Pointer Gestures",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.5.1.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.5.1"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.5.2",
    name: "Pointer Cancellation",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.5.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.5.2"],
    severity: "moderate",
  },
  {
    id: "en301549-9.2.5.3",
    name: "Label in Name",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.5.3.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.5.3"],
    severity: "serious",
  },
  {
    id: "en301549-9.2.5.4",
    name: "Motion Actuation",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 2.5.4.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.5.4"],
    severity: "moderate",
  },
  // Principle 3: Understandable
  {
    id: "en301549-9.3.1.1",
    name: "Language of Page",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.1.1.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.1.1"],
    severity: "serious",
  },
  {
    id: "en301549-9.3.1.2",
    name: "Language of Parts",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.1.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.1.2"],
    severity: "moderate",
  },
  {
    id: "en301549-9.3.2.1",
    name: "On Focus",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.2.1.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.2.1"],
    severity: "serious",
  },
  {
    id: "en301549-9.3.2.2",
    name: "On Input",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.2.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.2.2"],
    severity: "moderate",
  },
  {
    id: "en301549-9.3.2.3",
    name: "Consistent Navigation",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.2.3.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.2.3"],
    severity: "moderate",
  },
  {
    id: "en301549-9.3.2.4",
    name: "Consistent Identification",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.2.4.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.2.4"],
    severity: "moderate",
  },
  {
    id: "en301549-9.3.3.1",
    name: "Error Identification",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.3.1.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.3.1"],
    severity: "serious",
  },
  {
    id: "en301549-9.3.3.2",
    name: "Labels or Instructions",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.3.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.3.2"],
    severity: "moderate",
  },
  {
    id: "en301549-9.3.3.3",
    name: "Error Suggestion",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.3.3.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.3.3"],
    severity: "moderate",
  },
  {
    id: "en301549-9.3.3.4",
    name: "Error Prevention (Legal, Financial, Data)",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 3.3.4.",
    regulation: "EN 301 549",
    wcagCriteria: ["3.3.4"],
    severity: "serious",
  },
  // Principle 4: Robust
  {
    id: "en301549-9.4.1.1",
    name: "Parsing",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 4.1.1 Parsing.",
    regulation: "EN 301 549",
    wcagCriteria: ["4.1.1"],
    severity: "moderate",
  },
  {
    id: "en301549-9.4.1.2",
    name: "Name, Role, Value",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 4.1.2.",
    regulation: "EN 301 549",
    wcagCriteria: ["4.1.2"],
    severity: "critical",
  },
  {
    id: "en301549-9.4.1.3",
    name: "Status Messages",
    description:
      "Where ICT is a web page, it shall satisfy WCAG 2.1 SC 4.1.3.",
    regulation: "EN 301 549",
    wcagCriteria: ["4.1.3"],
    severity: "moderate",
  },
];

/**
 * EN 301 549 Chapter 11 — Software (additional requirements beyond WCAG)
 * These apply to web applications with rich interactions
 */
export const EN_301_549_SOFTWARE_RULES: ComplianceRule[] = [
  {
    id: "en301549-11.5.2.3",
    name: "Use of Accessibility Services",
    description:
      "Software shall use applicable platform accessibility services for UI elements.",
    regulation: "EN 301 549",
    wcagCriteria: ["4.1.2"],
    severity: "serious",
  },
  {
    id: "en301549-11.5.2.5",
    name: "Object Information",
    description:
      "Where ICT is software, it shall expose the object role, states, boundary, name and description programmatically.",
    regulation: "EN 301 549",
    wcagCriteria: ["4.1.2"],
    severity: "serious",
  },
  {
    id: "en301549-11.5.2.12",
    name: "Execution of Available Actions",
    description:
      "Where permitted by security, software shall allow assistive technology to execute available actions on objects.",
    regulation: "EN 301 549",
    wcagCriteria: ["2.1.1"],
    severity: "serious",
  },
  {
    id: "en301549-11.7",
    name: "User Preferences",
    description:
      "Software shall respect platform settings for units of measurement, color, contrast, font type/size, focus cursor, and haptics.",
    regulation: "EN 301 549",
    wcagCriteria: ["1.4.3", "1.4.4"],
    severity: "moderate",
  },
];

/**
 * EN 301 549 Chapter 12 — Documentation and Support Services
 */
export const EN_301_549_DOCS_RULES: ComplianceRule[] = [
  {
    id: "en301549-12.1.1",
    name: "Accessibility and Compatibility Features",
    description:
      "Product documentation shall list and explain how to use accessibility and compatibility features.",
    regulation: "EN 301 549",
    wcagCriteria: [],
    severity: "moderate",
  },
  {
    id: "en301549-12.1.2",
    name: "Accessible Documentation",
    description:
      "Product documentation shall be made available in at least one accessible electronic format.",
    regulation: "EN 301 549",
    wcagCriteria: [],
    severity: "serious",
  },
  {
    id: "en301549-12.2.2",
    name: "Information on Accessibility Features",
    description:
      "ICT support services shall provide information about accessibility features included in product documentation.",
    regulation: "EN 301 549",
    wcagCriteria: [],
    severity: "moderate",
  },
  {
    id: "en301549-12.2.3",
    name: "Effective Communication",
    description:
      "ICT support services shall accommodate the communication needs of individuals with disabilities.",
    regulation: "EN 301 549",
    wcagCriteria: [],
    severity: "serious",
  },
];

/** All EN 301 549 rules combined */
export const EN_301_549_ALL_RULES: ComplianceRule[] = [
  ...EN_301_549_WEB_RULES,
  ...EN_301_549_SOFTWARE_RULES,
  ...EN_301_549_DOCS_RULES,
];
