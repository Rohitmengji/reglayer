/**
 * RegLayer — Static Accessibility Review of Changed Code
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: re-implement static JSX accessibility analysis.
 * `eslint-plugin-jsx-a11y` is installed here with the full recommended ruleset, and it
 * is far better at parsing JSX than anything worth hand-rolling. Building a competing
 * analyser would duplicate a mature tool and immediately drift from it.
 *
 * WHAT IS ACTUALLY MISSING is the layer above it. `eslint.config.mjs` states the problem
 * in its own comments: there is a backlog of 74 jsx-a11y findings, so rules that SHOULD
 * be errors are pinned to "warn" — because turning them on today "would wall off all
 * work behind an unrelated cleanup". The stated plan is to ratchet: clear the backlog,
 * then escalate.
 *
 * A diff-aware reviewer delivers that ratchet immediately. The 74 existing findings stay
 * warnings; anything introduced on a CHANGED LINE blocks. The backlog stops growing
 * before it has been cleared, which is the only version of this that a team adopts.
 *
 * "Incremental without rescanning" therefore means: lint only changed files, then report
 * only on changed lines. No project-wide scan, no whole-file noise on a two-line PR.
 */

import { lookupCriterion } from "@/lib/ai/safety/wcag-fact-check";
import { assessConfidence, type ConfidenceAssessment } from "@/lib/ai/remediation/confidence";

// ── Diff parsing ─────────────────────────────────────────────────────────────

/** Added line numbers, per file, in the HEAD revision. */
export type ChangedLines = Map<string, Set<number>>;

const FILE_HEADER = /^\+\+\+ b\/(.+)$/;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Extract added lines from a unified diff.
 *
 * Only ADDED lines count. A context line is code the author did not touch, and
 * commenting on it is how a reviewer starts blaming people for other people's work —
 * the precise behaviour that gets these tools switched off.
 *
 * Off-by-one errors here put comments on the wrong line, so the counter advances only
 * for lines that exist in the new revision: context and additions advance it, deletions
 * do not.
 */
export function parseUnifiedDiff(diff: string): ChangedLines {
  const changed: ChangedLines = new Map();
  let currentFile: string | null = null;
  let lineNumber = 0;

  for (const raw of diff.split("\n")) {
    const fileMatch = raw.match(FILE_HEADER);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!changed.has(currentFile)) changed.set(currentFile, new Set());
      continue;
    }

    const hunkMatch = raw.match(HUNK_HEADER);
    if (hunkMatch) {
      lineNumber = Number(hunkMatch[1]);
      continue;
    }

    if (!currentFile) continue;

    // `+++` is a header, already handled; `---` likewise. Guard so a diff of a diff
    // does not corrupt the counter.
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;

    if (raw.startsWith("+")) {
      changed.get(currentFile)!.add(lineNumber);
      lineNumber += 1;
    } else if (raw.startsWith("-")) {
      // Deleted lines do not exist in the new file, so the counter must not advance.
    } else if (raw.startsWith(" ") || raw === "") {
      lineNumber += 1;
    }
  }

  return changed;
}

// ── Lint findings ────────────────────────────────────────────────────────────

/** Shape of an ESLint result, narrowed to what a review needs. */
export interface LintFinding {
  file: string;
  line: number;
  ruleId: string;
  message: string;
}

/**
 * Keep only findings on lines this PR added.
 *
 * This is what makes the review incremental: existing violations in a touched file are
 * left alone, so a one-line change does not surface a file's entire history.
 */
export function filterToChangedLines(
  findings: readonly LintFinding[],
  changed: ChangedLines,
): LintFinding[] {
  return findings.filter((finding) => changed.get(finding.file)?.has(finding.line) ?? false);
}

// ── Enrichment ───────────────────────────────────────────────────────────────

export type ReviewSeverity = "blocking" | "warning" | "info";

interface RuleKnowledge {
  /** WCAG criteria, validated against the criteria database before use. */
  criteria: string[];
  category:
    | "semantic-html"
    | "keyboard"
    | "aria"
    | "focus"
    | "naming"
    | "contrast";
  severity: ReviewSeverity;
  /** Why this matters, in terms of who is affected. */
  explanation: string;
  /** The teaching point — what a reviewer would say once, so it is not repeated. */
  education: string;
  suggestion: string;
  confidence: ConfidenceAssessment;
}

const mechanical = assessConfidence({
  requiresHumanContent: false,
  requiresDesignDecision: false,
  contextDependent: false,
  hasSingleCorrectFix: true,
});

const needsAuthoring = assessConfidence({
  requiresHumanContent: true,
  requiresDesignDecision: false,
  contextDependent: true,
  hasSingleCorrectFix: false,
});

const needsJudgement = assessConfidence({
  requiresHumanContent: false,
  requiresDesignDecision: false,
  contextDependent: true,
  hasSingleCorrectFix: false,
});

const RULE_KNOWLEDGE: Record<string, RuleKnowledge> = {
  "jsx-a11y/click-events-have-key-events": {
    criteria: ["2.1.1"],
    category: "keyboard",
    severity: "blocking",
    explanation:
      "A click handler on a non-interactive element is unreachable by keyboard. Anyone " +
      "navigating with Tab, a switch device, or voice control cannot trigger it at all.",
    education:
      "Reach for the native element before adding handlers. A <button> is focusable, " +
      "activates on both Enter and Space, announces its role, and works with voice " +
      "control — replicating that on a <div> takes a tabIndex, a role, and two key " +
      "handlers, and is still easy to get subtly wrong.",
    suggestion:
      `- <div onClick={handleSelect}>Select</div>\n` +
      `+ <button type="button" onClick={handleSelect}>Select</button>`,
    confidence: needsJudgement,
  },

  "jsx-a11y/no-static-element-interactions": {
    criteria: ["2.1.1", "4.1.2"],
    category: "semantic-html",
    severity: "blocking",
    explanation:
      "A <div> or <span> carrying an interaction has no role, so assistive technology " +
      "announces nothing to indicate it can be activated.",
    education:
      "Screen reader users navigate by role — listing buttons, links, and form controls. " +
      "An interactive <div> is invisible to that entire navigation mode, even when a " +
      "keyboard handler makes it technically operable.",
    suggestion:
      `- <span onClick={onToggle}>Toggle</span>\n` +
      `+ <button type="button" onClick={onToggle}>Toggle</button>`,
    confidence: needsJudgement,
  },

  "jsx-a11y/label-has-associated-control": {
    criteria: ["1.3.1", "3.3.2"],
    category: "naming",
    severity: "blocking",
    explanation:
      "A label not programmatically bound to its control leaves the field unnamed. " +
      "Screen readers announce \"edit text\" with no indication of what to type.",
    education:
      "Association also enlarges the click target: clicking a bound label focuses its " +
      "input, which materially helps users with motor impairments. `htmlFor` must match " +
      "the input's `id` — visual adjacency means nothing to the accessibility tree.",
    suggestion:
      `- <label>Email</label>\n` +
      `- <input type="email" />\n` +
      `+ <label htmlFor="email">Email</label>\n` +
      `+ <input id="email" type="email" />`,
    confidence: mechanical,
  },

  "jsx-a11y/no-noninteractive-tabindex": {
    criteria: ["2.4.3"],
    category: "focus",
    severity: "warning",
    explanation:
      "Adding tabIndex to a non-interactive element inserts a stop in the tab order that " +
      "does nothing when reached, which reads as a broken interface.",
    education:
      "Never use a positive tabIndex — it overrides document order globally and creates " +
      "a sequence nobody can predict. `tabIndex={0}` on a genuinely interactive element " +
      "and `tabIndex={-1}` for programmatic focus are the only two values worth using.",
    suggestion:
      `- <div tabIndex={0}>Informational text</div>\n` +
      `+ <div>Informational text</div>`,
    confidence: needsJudgement,
  },

  "jsx-a11y/no-autofocus": {
    criteria: ["2.4.3"],
    category: "focus",
    severity: "info",
    explanation:
      "Automatic focus moves a screen reader user's position without warning and can " +
      "skip past content they have not yet heard.",
    education:
      "This one deserves judgement rather than a reflexive fix. Moving focus INTO a " +
      "newly opened dialog is required by the ARIA Authoring Practices — the anti-pattern " +
      "is autofocus on page load. Audit the context before removing it.",
    suggestion:
      `// In a dialog, prefer explicit focus management over the autoFocus attribute\n` +
      `useEffect(() => { closeButtonRef.current?.focus(); }, []);`,
    confidence: needsJudgement,
  },

  "jsx-a11y/aria-props": {
    criteria: ["4.1.2"],
    category: "aria",
    severity: "blocking",
    explanation:
      "An ARIA attribute that does not exist is silently ignored, so the accessibility " +
      "it was meant to provide is simply absent.",
    education:
      "Misspelled ARIA fails silently — nothing warns at runtime, and the element looks " +
      "correct in the source. This is exactly the class of defect a linter should catch, " +
      "which is why this rule is already pinned to \"error\" in this repo.",
    suggestion:
      `- <div aria-labeledby="title" />   {/* one 'l' — not a real attribute */}\n` +
      `+ <div aria-labelledby="title" />`,
    confidence: mechanical,
  },

  "jsx-a11y/aria-role": {
    criteria: ["4.1.2"],
    category: "aria",
    severity: "blocking",
    explanation:
      "An invalid role leaves the element with its implicit role or none at all, so it " +
      "is announced as something other than intended.",
    education:
      "Prefer a native element over a role wherever one exists. `role=\"button\"` on a " +
      "<div> still needs tabIndex and key handlers; a <button> needs none of them.",
    suggestion:
      `- <div role="clickable" onClick={onSave} />\n` +
      `+ <button type="button" onClick={onSave} />`,
    confidence: mechanical,
  },

  "jsx-a11y/alt-text": {
    criteria: ["1.1.1"],
    category: "naming",
    severity: "blocking",
    explanation:
      "An image with no text alternative removes whatever it conveys for anyone who " +
      "cannot see it.",
    education:
      "`alt=\"\"` is a deliberate statement that the image is decorative, and is correct " +
      "when the surrounding text already carries the meaning. A MISSING alt is not the " +
      "same thing — it leaves the behaviour to the user agent.",
    suggestion:
      `- <img src={chart} />\n` +
      `+ <img src={chart} alt="Score rose from 72 to 94 between January and June" />`,
    confidence: needsAuthoring,
  },

  "jsx-a11y/anchor-is-valid": {
    criteria: ["2.1.1", "4.1.2"],
    category: "semantic-html",
    severity: "blocking",
    explanation:
      "An anchor without a real href is not focusable and is announced as a link that " +
      "goes nowhere.",
    education:
      "The distinction is intent: a link NAVIGATES, a button ACTS. Screen reader users " +
      "rely on that difference when deciding whether activating something will move them " +
      "off the page.",
    suggestion:
      `- <a href="#" onClick={onSubmit}>Submit</a>\n` +
      `+ <button type="button" onClick={onSubmit}>Submit</button>`,
    confidence: needsJudgement,
  },
};

export interface ReviewFinding {
  file: string;
  line: number;
  ruleId: string;
  severity: ReviewSeverity;
  category: RuleKnowledge["category"];
  wcag: { id: string; name: string; level: string; url: string }[];
  explanation: string;
  education: string;
  suggestion: string;
  confidence: ConfidenceAssessment;
}

function wcagReferences(ids: readonly string[]) {
  return ids
    .map((id) => {
      // Validated, never asserted — an invented criterion in a review comment is read
      // as fact by the developer acting on it.
      const criterion = lookupCriterion(id);
      if (!criterion) return null;
      const slug = criterion.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return {
        id: criterion.id,
        name: criterion.name,
        level: criterion.level,
        url: `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`,
      };
    })
    .filter((ref): ref is NonNullable<typeof ref> => ref !== null);
}

/**
 * Attach WCAG, severity, teaching, and confidence to a raw lint finding.
 * Returns null for rules with no authored knowledge, so a review never emits a bare
 * lint message dressed up as expert guidance.
 */
export function enrichFinding(finding: LintFinding): ReviewFinding | null {
  const knowledge = RULE_KNOWLEDGE[finding.ruleId];
  if (!knowledge) return null;

  return {
    file: finding.file,
    line: finding.line,
    ruleId: finding.ruleId,
    severity: knowledge.severity,
    category: knowledge.category,
    wcag: wcagReferences(knowledge.criteria),
    explanation: knowledge.explanation,
    education: knowledge.education,
    suggestion: knowledge.suggestion,
    confidence: knowledge.confidence,
  };
}

// ── Review assembly ──────────────────────────────────────────────────────────

export interface StaticReviewComment {
  file: string;
  line: number;
  body: string;
  blocking: boolean;
}

export interface StaticReview {
  comments: StaticReviewComment[];
  verdict: "block" | "comment" | "pass";
  summary: string;
}

const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  blocking: "🔴 Blocking",
  warning: "🟡 Warning",
  info: "🔵 Note",
};

function renderComment(finding: ReviewFinding): string {
  const lines = [
    `${SEVERITY_LABEL[finding.severity]} — \`${finding.ruleId}\``,
    "",
    finding.explanation,
  ];

  if (finding.wcag.length > 0) {
    lines.push(
      "",
      `**WCAG:** ${finding.wcag.map((w) => `[SC ${w.id} ${w.name} (Level ${w.level})](${w.url})`).join(", ")}`,
    );
  }

  lines.push("", "**Suggested change**", "```diff", finding.suggestion, "```");
  lines.push("", `<details><summary>Why this matters</summary>\n\n${finding.education}\n\n</details>`);
  lines.push(
    "",
    `_Fix confidence: **${finding.confidence.level}** — ` +
    `${finding.confidence.autoApplicable ? "safe to apply as-is" : "review before applying"}._`,
  );

  return lines.join("\n");
}

/**
 * Build a review from lint findings and a diff.
 *
 * Only changed lines are considered, so an unrelated PR never inherits a file's history.
 */
export function buildStaticReview(
  findings: readonly LintFinding[],
  diff: string,
): StaticReview {
  const changed = parseUnifiedDiff(diff);
  const onChangedLines = filterToChangedLines(findings, changed);

  const enriched = onChangedLines
    .map(enrichFinding)
    .filter((f): f is ReviewFinding => f !== null);

  const blocking = enriched.filter((f) => f.severity === "blocking");

  const comments: StaticReviewComment[] = enriched
    .sort((a, b) => Number(b.severity === "blocking") - Number(a.severity === "blocking"))
    .map((finding) => ({
      file: finding.file,
      line: finding.line,
      body: renderComment(finding),
      blocking: finding.severity === "blocking",
    }));

  const verdict = blocking.length > 0 ? "block" : enriched.length > 0 ? "comment" : "pass";

  const summary =
    enriched.length === 0
      ? "No new accessibility issues in the changed lines."
      : `${enriched.length} accessibility issue${enriched.length === 1 ? "" : "s"} on changed lines` +
        (blocking.length > 0 ? `, ${blocking.length} blocking merge.` : ", none blocking.");

  return { comments, verdict, summary };
}

/** Rules with authored review knowledge, for coverage reporting. */
export function reviewedRules(): string[] {
  return Object.keys(RULE_KNOWLEDGE);
}
