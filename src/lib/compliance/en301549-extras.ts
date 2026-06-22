/**
 * WHY: EN 301 549 (the EAA's harmonised standard) has requirements BEYOND WCAG 2.1.
 *      These extras are what make EAA compliance harder than ADA compliance — a site
 *      can pass all WCAG criteria and still fail EAA due to missing documentation,
 *      support services, or functional performance requirements.
 * WHAT: Models the non-WCAG requirements from EN 301 549 that apply to web services.
 * HOW: Pure constants with evaluation helpers. Used by the evaluator to add EAA-specific
 *      findings that other jurisdictions don't require.
 */

export interface EN301549ExtraRequirement {
  id: string;
  clause: string;
  title: string;
  description: string;
  /** How this can be evaluated (automated, manual, documentation review) */
  evaluationMethod: "automated" | "manual" | "documentation" | "self_declaration";
  /** Default question to ask the site operator for self-declaration */
  selfDeclarationPrompt: string;
  /** If true, this is almost always applicable to web services */
  typicallyApplicable: boolean;
}

/**
 * EN 301 549 requirements applicable to web services that go BEYOND WCAG clause 9.
 * These are from clauses 5, 7, 11, and 12 that apply to web-based products/services.
 */
export const EN301549_EXTRA_REQUIREMENTS: EN301549ExtraRequirement[] = [
  // ─── Clause 5: Generic requirements ────────────────────────────────────────
  {
    id: "EN-5.2",
    clause: "5.2",
    title: "Activation of accessibility features",
    description: "Where ICT has documented accessibility features, it shall be possible to activate those features without requiring a method that does not support the user's need.",
    evaluationMethod: "manual",
    selfDeclarationPrompt: "Can users activate accessibility features (e.g., high contrast mode, text resizing) without requiring fine motor skills or visual-only interactions?",
    typicallyApplicable: true,
  },
  {
    id: "EN-5.3",
    clause: "5.3",
    title: "Biometrics",
    description: "Where ICT uses biological characteristics, it shall not rely on the use of a particular biological characteristic as the only means of user identification or control.",
    evaluationMethod: "self_declaration",
    selfDeclarationPrompt: "If your service uses biometrics (fingerprint, face ID), is there always a non-biometric alternative available?",
    typicallyApplicable: false,
  },
  {
    id: "EN-5.4",
    clause: "5.4",
    title: "Preservation of accessibility information during conversion",
    description: "Where ICT converts information or communication, it shall preserve all documented non-proprietary accessibility information to the extent that the destination format supports it.",
    evaluationMethod: "manual",
    selfDeclarationPrompt: "When your service converts content (e.g., copy/paste, export, format conversion), is accessibility information (alt text, semantic structure, reading order) preserved?",
    typicallyApplicable: true,
  },
  // ─── Clause 7: ICT with video capabilities ─────────────────────────────────
  {
    id: "EN-7.1.1",
    clause: "7.1.1",
    title: "Captioning playback",
    description: "Where ICT displays video with synchronized audio, it shall have a mode of operation to display the available captions.",
    evaluationMethod: "manual",
    selfDeclarationPrompt: "If your service includes video content, can users enable/display captions (closed captions or subtitles)?",
    typicallyApplicable: false,
  },
  {
    id: "EN-7.1.2",
    clause: "7.1.2",
    title: "Captioning synchronization",
    description: "Where ICT displays captions, the mechanism to display captions shall preserve synchronization between the audio and the corresponding captions.",
    evaluationMethod: "manual",
    selfDeclarationPrompt: "If captions are provided, are they properly synchronized with the audio content?",
    typicallyApplicable: false,
  },
  {
    id: "EN-7.3",
    clause: "7.3",
    title: "User controls for captions and audio description",
    description: "Where ICT primarily displays materials containing video with associated audio content, user controls to activate subtitling and audio description shall be provided at the same level of interaction as the primary media controls.",
    evaluationMethod: "manual",
    selfDeclarationPrompt: "Are caption and audio description controls at the same level as play/pause/volume controls (not buried in settings)?",
    typicallyApplicable: false,
  },
  // ─── Clause 9.6: WCAG conformance requirements ─────────────────────────────
  {
    id: "EN-9.6",
    clause: "9.6",
    title: "WCAG conformance requirements",
    description: "Web content shall satisfy all WCAG 2.1 Level AA conformance requirements: (1) for full pages, (2) for complete processes, (3) in an accessibility-supported way.",
    evaluationMethod: "manual",
    selfDeclarationPrompt: "Does your entire website (not just tested pages) meet WCAG 2.1 AA? Are all multi-step processes (checkout, registration) accessible end-to-end?",
    typicallyApplicable: true,
  },
  // ─── Clause 12: Documentation and support services ─────────────────────────
  {
    id: "EN-12.1.1",
    clause: "12.1.1",
    title: "Accessibility and compatibility features documentation",
    description: "Product documentation shall list and explain how to use the accessibility and compatibility features of the ICT. This includes information about assistive technology compatibility.",
    evaluationMethod: "documentation",
    selfDeclarationPrompt: "Do you publish documentation describing the accessibility features of your service and how to use them? Is this documentation itself accessible?",
    typicallyApplicable: true,
  },
  {
    id: "EN-12.1.2",
    clause: "12.1.2",
    title: "Accessible documentation",
    description: "Product documentation provided with the ICT shall be made available in at least one of accessible electronic formats.",
    evaluationMethod: "documentation",
    selfDeclarationPrompt: "Is your product documentation available in accessible formats (accessible HTML, tagged PDF, etc.)?",
    typicallyApplicable: true,
  },
  {
    id: "EN-12.2.2",
    clause: "12.2.2",
    title: "Information on accessibility and compatibility features",
    description: "ICT support services shall provide information on the accessibility and compatibility features of the product.",
    evaluationMethod: "self_declaration",
    selfDeclarationPrompt: "Can your support team (help desk, chat, documentation) provide information about accessibility features when asked?",
    typicallyApplicable: true,
  },
  {
    id: "EN-12.2.3",
    clause: "12.2.3",
    title: "Effective communication",
    description: "ICT support services shall accommodate the communication needs of individuals with disabilities either directly or through a referral point.",
    evaluationMethod: "self_declaration",
    selfDeclarationPrompt: "Can people with disabilities contact your support team through accessible channels (not only phone, not only chat)?",
    typicallyApplicable: true,
  },
  {
    id: "EN-12.2.4",
    clause: "12.2.4",
    title: "Accessible documentation",
    description: "Documentation provided by support services shall be made available in an accessible format.",
    evaluationMethod: "documentation",
    selfDeclarationPrompt: "Is the documentation provided by your support services (FAQs, guides, help articles) accessible?",
    typicallyApplicable: true,
  },
];

/** Get only the requirements typically applicable to web services */
export function getWebApplicableExtras(): EN301549ExtraRequirement[] {
  return EN301549_EXTRA_REQUIREMENTS.filter((r) => r.typicallyApplicable);
}

/** Get extras by evaluation method */
export function getExtrasByMethod(method: EN301549ExtraRequirement["evaluationMethod"]): EN301549ExtraRequirement[] {
  return EN301549_EXTRA_REQUIREMENTS.filter((r) => r.evaluationMethod === method);
}
