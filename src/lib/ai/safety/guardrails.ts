/**
 * AI Output Guardrails — validates LLM responses before delivery.
 *
 * WHY: An accessibility compliance tool giving wrong legal advice = liability.
 *      Must validate outputs, detect hallucinated WCAG criteria, and filter
 *      harmful content before it reaches the user.
 * WHAT: Post-generation validation pipeline.
 * HOW: Pattern matching + WCAG criterion validation + content policy checks.
 */

// ── Valid WCAG 2.1 Success Criteria ──────────────────────────────────────────

const VALID_WCAG_CRITERIA = new Set([
  // 1.x Perceivable
  "1.1.1", "1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.2.6", "1.2.7", "1.2.8", "1.2.9",
  "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5", "1.3.6",
  "1.4.1", "1.4.2", "1.4.3", "1.4.4", "1.4.5", "1.4.6", "1.4.7", "1.4.8", "1.4.9",
  "1.4.10", "1.4.11", "1.4.12", "1.4.13",
  // 2.x Operable
  "2.1.1", "2.1.2", "2.1.3", "2.1.4",
  "2.2.1", "2.2.2", "2.2.3", "2.2.4", "2.2.5", "2.2.6",
  "2.3.1", "2.3.2", "2.3.3",
  "2.4.1", "2.4.2", "2.4.3", "2.4.4", "2.4.5", "2.4.6", "2.4.7", "2.4.8", "2.4.9", "2.4.10",
  "2.5.1", "2.5.2", "2.5.3", "2.5.4", "2.5.5", "2.5.6",
  // 3.x Understandable
  "3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5", "3.1.6",
  "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.5",
  "3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.5", "3.3.6",
  // 4.x Robust
  "4.1.1", "4.1.2", "4.1.3",
  // WCAG 2.2 additions
  "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8", "3.3.9",
]);

/**
 * Detect hallucinated WCAG criterion references in AI output.
 * Returns array of invalid criteria found.
 */
export function detectHallucinatedCriteria(text: string): string[] {
  const criteriaPattern = /\b(\d\.\d\.\d{1,2})\b/g;
  const found: string[] = [];
  let match;
  while ((match = criteriaPattern.exec(text)) !== null) {
    const criterion = match[1];
    if (!VALID_WCAG_CRITERIA.has(criterion)) {
      found.push(criterion);
    }
  }
  return [...new Set(found)];
}

// ── Jailbreak Detection ──────────────────────────────────────────────────────

const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /disregard\s+(all\s+)?prior\s+instructions/i,
  /you\s+are\s+now\s+(?:DAN|evil|unrestricted|jailbroken)/i,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:different|evil|unrestricted)/i,
  /bypass\s+(?:your\s+)?(?:safety|content|ethical)\s+(?:filters|guidelines|restrictions)/i,
  /act\s+as\s+(?:if\s+)?(?:you\s+have\s+)?no\s+(?:rules|restrictions|limitations)/i,
  /\[system\]\s*you\s+are/i,
  /\<\|im_start\|\>/i,
  /\<\|system\|\>/i,
  /developer\s+mode\s+(?:enabled|activated|on)/i,
  /do\s+anything\s+now/i,
  /jailbreak/i,
];

/**
 * Detect potential jailbreak attempts in user input.
 * Returns true if suspicious patterns found.
 */
export function detectJailbreakAttempt(input: string): boolean {
  return JAILBREAK_PATTERNS.some((pattern) => pattern.test(input));
}

// ── Output Content Policy ────────────────────────────────────────────────────

export interface GuardrailResult {
  safe: boolean;
  warnings: string[];
  hallucinatedCriteria: string[];
  modified?: string;
}

/**
 * Validate AI output before delivery to user.
 * Checks for hallucinated WCAG criteria, adds disclaimers for legal content.
 */
export function validateAIOutput(output: string): GuardrailResult {
  const warnings: string[] = [];
  let modified = output;

  // Check for hallucinated WCAG criteria
  const hallucinated = detectHallucinatedCriteria(output);
  if (hallucinated.length > 0) {
    warnings.push(`Potentially invalid WCAG criteria referenced: ${hallucinated.join(", ")}`);
    // Append warning to output
    modified += `\n\n> ⚠️ *Note: This response references WCAG criteria (${hallucinated.join(", ")}) that may not exist. Please verify against the [official WCAG specification](https://www.w3.org/TR/WCAG21/).*`;
  }

  // Check for definitive legal claims
  const legalPatterns = [
    /you\s+(?:will|would)\s+(?:definitely|certainly)\s+(?:win|lose)\s+(?:the|a)\s+(?:lawsuit|case)/i,
    /(?:guaranteed|certain)\s+(?:compliance|penalty|fine)/i,
    /this\s+(?:is|constitutes)\s+legal\s+advice/i,
  ];
  for (const pattern of legalPatterns) {
    if (pattern.test(output)) {
      warnings.push("Response may contain definitive legal claims");
      if (!modified.includes("not legal advice")) {
        modified += "\n\n> ℹ️ *This information is for educational purposes only and does not constitute legal advice. Consult a qualified attorney for legal guidance.*";
      }
      break;
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
    hallucinatedCriteria: hallucinated,
    modified: modified !== output ? modified : undefined,
  };
}
