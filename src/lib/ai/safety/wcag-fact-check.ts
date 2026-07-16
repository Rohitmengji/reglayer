/**
 * WCAG Fact-Checking — validates AI responses against official specification.
 *
 * WHY: AI may hallucinate WCAG criteria, cite wrong conformance levels,
 *      or provide inaccurate legal deadlines. For compliance software,
 *      inaccurate advice = legal liability.
 * WHAT: Post-generation validation of WCAG claims against ground truth.
 * HOW: Pattern matching + lookup against authoritative WCAG database.
 */

// ── Authoritative WCAG 2.1 + 2.2 Success Criteria Database ──────────────────

interface WcagCriterion {
  id: string;
  name: string;
  level: "A" | "AA" | "AAA";
  principle: string;
  guideline: string;
  version: "2.0" | "2.1" | "2.2";
}

const WCAG_DATABASE: WcagCriterion[] = [
  // Principle 1: Perceivable
  { id: "1.1.1", name: "Non-text Content", level: "A", principle: "Perceivable", guideline: "Text Alternatives", version: "2.0" },
  { id: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", principle: "Perceivable", guideline: "Time-based Media", version: "2.0" },
  { id: "1.2.2", name: "Captions (Prerecorded)", level: "A", principle: "Perceivable", guideline: "Time-based Media", version: "2.0" },
  { id: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A", principle: "Perceivable", guideline: "Time-based Media", version: "2.0" },
  { id: "1.2.4", name: "Captions (Live)", level: "AA", principle: "Perceivable", guideline: "Time-based Media", version: "2.0" },
  { id: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", principle: "Perceivable", guideline: "Time-based Media", version: "2.0" },
  { id: "1.3.1", name: "Info and Relationships", level: "A", principle: "Perceivable", guideline: "Adaptable", version: "2.0" },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A", principle: "Perceivable", guideline: "Adaptable", version: "2.0" },
  { id: "1.3.3", name: "Sensory Characteristics", level: "A", principle: "Perceivable", guideline: "Adaptable", version: "2.0" },
  { id: "1.3.4", name: "Orientation", level: "AA", principle: "Perceivable", guideline: "Adaptable", version: "2.1" },
  { id: "1.3.5", name: "Identify Input Purpose", level: "AA", principle: "Perceivable", guideline: "Adaptable", version: "2.1" },
  { id: "1.4.1", name: "Use of Color", level: "A", principle: "Perceivable", guideline: "Distinguishable", version: "2.0" },
  { id: "1.4.2", name: "Audio Control", level: "A", principle: "Perceivable", guideline: "Distinguishable", version: "2.0" },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA", principle: "Perceivable", guideline: "Distinguishable", version: "2.0" },
  { id: "1.4.4", name: "Resize Text", level: "AA", principle: "Perceivable", guideline: "Distinguishable", version: "2.0" },
  { id: "1.4.5", name: "Images of Text", level: "AA", principle: "Perceivable", guideline: "Distinguishable", version: "2.0" },
  { id: "1.4.10", name: "Reflow", level: "AA", principle: "Perceivable", guideline: "Distinguishable", version: "2.1" },
  { id: "1.4.11", name: "Non-text Contrast", level: "AA", principle: "Perceivable", guideline: "Distinguishable", version: "2.1" },
  { id: "1.4.12", name: "Text Spacing", level: "AA", principle: "Perceivable", guideline: "Distinguishable", version: "2.1" },
  { id: "1.4.13", name: "Content on Hover or Focus", level: "AA", principle: "Perceivable", guideline: "Distinguishable", version: "2.1" },
  // Principle 2: Operable
  { id: "2.1.1", name: "Keyboard", level: "A", principle: "Operable", guideline: "Keyboard Accessible", version: "2.0" },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A", principle: "Operable", guideline: "Keyboard Accessible", version: "2.0" },
  { id: "2.1.4", name: "Character Key Shortcuts", level: "A", principle: "Operable", guideline: "Keyboard Accessible", version: "2.1" },
  { id: "2.2.1", name: "Timing Adjustable", level: "A", principle: "Operable", guideline: "Enough Time", version: "2.0" },
  { id: "2.2.2", name: "Pause, Stop, Hide", level: "A", principle: "Operable", guideline: "Enough Time", version: "2.0" },
  { id: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", principle: "Operable", guideline: "Seizures and Physical Reactions", version: "2.0" },
  { id: "2.4.1", name: "Bypass Blocks", level: "A", principle: "Operable", guideline: "Navigable", version: "2.0" },
  { id: "2.4.2", name: "Page Titled", level: "A", principle: "Operable", guideline: "Navigable", version: "2.0" },
  { id: "2.4.3", name: "Focus Order", level: "A", principle: "Operable", guideline: "Navigable", version: "2.0" },
  { id: "2.4.4", name: "Link Purpose (In Context)", level: "A", principle: "Operable", guideline: "Navigable", version: "2.0" },
  { id: "2.4.5", name: "Multiple Ways", level: "AA", principle: "Operable", guideline: "Navigable", version: "2.0" },
  { id: "2.4.6", name: "Headings and Labels", level: "AA", principle: "Operable", guideline: "Navigable", version: "2.0" },
  { id: "2.4.7", name: "Focus Visible", level: "AA", principle: "Operable", guideline: "Navigable", version: "2.0" },
  { id: "2.5.1", name: "Pointer Gestures", level: "A", principle: "Operable", guideline: "Input Modalities", version: "2.1" },
  { id: "2.5.2", name: "Pointer Cancellation", level: "A", principle: "Operable", guideline: "Input Modalities", version: "2.1" },
  { id: "2.5.3", name: "Label in Name", level: "A", principle: "Operable", guideline: "Input Modalities", version: "2.1" },
  { id: "2.5.4", name: "Motion Actuation", level: "A", principle: "Operable", guideline: "Input Modalities", version: "2.1" },
  // Principle 3: Understandable
  { id: "3.1.1", name: "Language of Page", level: "A", principle: "Understandable", guideline: "Readable", version: "2.0" },
  { id: "3.1.2", name: "Language of Parts", level: "AA", principle: "Understandable", guideline: "Readable", version: "2.0" },
  { id: "3.2.1", name: "On Focus", level: "A", principle: "Understandable", guideline: "Predictable", version: "2.0" },
  { id: "3.2.2", name: "On Input", level: "A", principle: "Understandable", guideline: "Predictable", version: "2.0" },
  { id: "3.2.3", name: "Consistent Navigation", level: "AA", principle: "Understandable", guideline: "Predictable", version: "2.0" },
  { id: "3.2.4", name: "Consistent Identification", level: "AA", principle: "Understandable", guideline: "Predictable", version: "2.0" },
  { id: "3.3.1", name: "Error Identification", level: "A", principle: "Understandable", guideline: "Input Assistance", version: "2.0" },
  { id: "3.3.2", name: "Labels or Instructions", level: "A", principle: "Understandable", guideline: "Input Assistance", version: "2.0" },
  { id: "3.3.3", name: "Error Suggestion", level: "AA", principle: "Understandable", guideline: "Input Assistance", version: "2.0" },
  { id: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", principle: "Understandable", guideline: "Input Assistance", version: "2.0" },
  // Principle 4: Robust
  { id: "4.1.1", name: "Parsing", level: "A", principle: "Robust", guideline: "Compatible", version: "2.0" },
  { id: "4.1.2", name: "Name, Role, Value", level: "A", principle: "Robust", guideline: "Compatible", version: "2.0" },
  { id: "4.1.3", name: "Status Messages", level: "AA", principle: "Robust", guideline: "Compatible", version: "2.1" },
  // WCAG 2.2 additions
  { id: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA", principle: "Operable", guideline: "Navigable", version: "2.2" },
  { id: "2.4.13", name: "Focus Appearance", level: "AAA", principle: "Operable", guideline: "Navigable", version: "2.2" },
  { id: "2.5.7", name: "Dragging Movements", level: "AA", principle: "Operable", guideline: "Input Modalities", version: "2.2" },
  { id: "2.5.8", name: "Target Size (Minimum)", level: "AA", principle: "Operable", guideline: "Input Modalities", version: "2.2" },
  { id: "3.2.6", name: "Consistent Help", level: "A", principle: "Understandable", guideline: "Predictable", version: "2.2" },
  { id: "3.3.7", name: "Redundant Entry", level: "A", principle: "Understandable", guideline: "Input Assistance", version: "2.2" },
  { id: "3.3.8", name: "Accessible Authentication (Minimum)", level: "AA", principle: "Understandable", guideline: "Input Assistance", version: "2.2" },
];

// Build lookup map for O(1) access
const CRITERIA_MAP = new Map(WCAG_DATABASE.map((c) => [c.id, c]));

// ── Public API ───────────────────────────────────────────────────────────────

export interface FactCheckResult {
  /** Claims in the AI response that reference WCAG criteria */
  claims: FactCheckedClaim[];
  /** Overall accuracy score (0-1) */
  accuracy: number;
  /** Whether any hallucinated criteria were found */
  hasHallucinations: boolean;
}

export interface FactCheckedClaim {
  /** The criterion ID referenced (e.g., "1.4.3") */
  criterion: string;
  /** Whether this is a valid WCAG criterion */
  valid: boolean;
  /** If valid, the official data */
  official?: { name: string; level: string; version: string };
  /** If the response claims a wrong level, flag it */
  levelMismatch?: { claimed: string; actual: string };
}

/**
 * Fact-check AI response against WCAG specification.
 * Validates all criterion references and detects level mismatches.
 */
export function factCheckWcagResponse(responseText: string): FactCheckResult {
  const claims: FactCheckedClaim[] = [];

  // Find all WCAG criterion references (e.g., "SC 1.4.3", "WCAG 1.4.3", "criterion 2.1.1")
  const criteriaPattern = /\b(\d\.\d\.\d{1,2})\b/g;
  const found = new Set<string>();
  let match;

  while ((match = criteriaPattern.exec(responseText)) !== null) {
    const id = match[1];
    if (found.has(id)) continue;
    found.add(id);

    const official = CRITERIA_MAP.get(id);
    if (!official) {
      claims.push({ criterion: id, valid: false });
    } else {
      const claim: FactCheckedClaim = {
        criterion: id,
        valid: true,
        official: { name: official.name, level: official.level, version: official.version },
      };

      // Check if response claims wrong conformance level
      const levelClaim = responseText.match(
        new RegExp(`${id.replace(".", "\\.")}[^.]*?\\b(Level\\s+)?(A{1,3})\\b`, "i")
      );
      if (levelClaim) {
        const claimed = levelClaim[2].toUpperCase();
        if (claimed !== official.level) {
          claim.levelMismatch = { claimed, actual: official.level };
        }
      }

      claims.push(claim);
    }
  }

  const validCount = claims.filter((c) => c.valid && !c.levelMismatch).length;
  const totalCount = claims.length;
  const accuracy = totalCount === 0 ? 1.0 : validCount / totalCount;

  return {
    claims,
    accuracy,
    hasHallucinations: claims.some((c) => !c.valid),
  };
}

/**
 * Look up a WCAG criterion by ID.
 */
export function lookupCriterion(id: string): WcagCriterion | undefined {
  return CRITERIA_MAP.get(id);
}

/**
 * Get all criteria for a specific conformance level.
 */
export function getCriteriaByLevel(level: "A" | "AA" | "AAA"): WcagCriterion[] {
  return WCAG_DATABASE.filter((c) => c.level === level);
}
