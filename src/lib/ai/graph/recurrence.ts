/**
 * RegLayer — Issue Recurrence Diagnosis
 *
 * THE MODELLING FLAW THIS ADDRESSES: `graph/service.ts::indexScan` creates violation
 * entities keyed `${ruleId}:${scanId}`. Every scan therefore mints a NEW node for the
 * same underlying problem, with no edge connecting it to the previous occurrence. The
 * graph accumulates thousands of disconnected violation nodes and can answer "what was
 * wrong on 3 March" but not "why does this keep coming back" — because recurrence is a
 * property of one issue's history, and that history was never assembled.
 *
 * The correction is an identity change, not a new table: an issue's identity is
 * (component, rule, selector) — stable across scans — and each detection or fix becomes
 * a timestamped EVENT on that one node. Recurrence then becomes readable from a single
 * node's timeline.
 *
 * WHY DIAGNOSIS AND NOT A COUNT: "this recurred 4 times" tells a team nothing they can
 * act on. The four common causes need four different interventions, and recommending the
 * wrong one wastes the fix. Distinguishing them is the entire value of keeping history.
 */

export type IssueEventType = "detected" | "fixed";

export interface IssueEvent {
  type: IssueEventType;
  at: Date;
  /** Page the event was observed on. */
  page: string;
  /** Component responsible, when the scanner could attribute one. */
  component?: string;
}

export type RecurrenceCause =
  /** No fix has ever been recorded — persistent, not recurring. */
  | "never-fixed"
  /** Fixed on one page, reappeared on a different page. The fix hit an instance, not the source. */
  | "fixed-at-instance"
  /** Fixed at the source, reappeared later on the same surface. Nothing prevents reintroduction. */
  | "no-regression-guard"
  /** Reappeared only on pages that did not previously exist. New code bypassed the fixed component. */
  | "new-surface"
  /** Reappeared almost immediately after a fix. Likely reverted or incompletely merged. */
  | "fix-reverted"
  /** Fixed and has not returned. */
  | "resolved";

export interface RecurrenceDiagnosis {
  cause: RecurrenceCause;
  /** Detections after the first recorded fix. */
  recurrences: number;
  fixes: number;
  /** Days between the last fix and the next detection, when both exist. */
  daysToRecurrence: number | null;
  explanation: string;
  /** What to do INSTEAD of applying the same fix again. */
  recommendedAction: string;
}

/** A recurrence this soon after a fix indicates the change did not survive, not that it decayed. */
const REVERT_WINDOW_DAYS = 3;

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/**
 * Diagnose why an issue keeps returning.
 *
 * Events may arrive unordered; they are sorted defensively because the diagnosis is
 * entirely a function of sequence, and an out-of-order event would silently invert it.
 */
export function diagnoseRecurrence(
  events: readonly IssueEvent[],
  /** Pages known to have been created after the last fix. Enables `new-surface`. */
  pagesAddedAfterFix: readonly string[] = [],
): RecurrenceDiagnosis {
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());

  const fixes = ordered.filter((e) => e.type === "fixed");
  const lastFix = fixes.at(-1) ?? null;

  if (!lastFix) {
    const detections = ordered.filter((e) => e.type === "detected").length;
    return {
      cause: "never-fixed",
      recurrences: 0,
      fixes: 0,
      daysToRecurrence: null,
      explanation:
        `Detected ${detections} time${detections === 1 ? "" : "s"} with no fix ever recorded. ` +
        "This is a persistent issue rather than a recurring one.",
      recommendedAction: "Apply the fix. There is no history suggesting it will not hold.",
    };
  }

  const afterFix = ordered.filter(
    (e) => e.type === "detected" && e.at.getTime() > lastFix.at.getTime(),
  );

  if (afterFix.length === 0) {
    return {
      cause: "resolved",
      recurrences: 0,
      fixes: fixes.length,
      daysToRecurrence: null,
      explanation: "Fixed and not seen since.",
      recommendedAction: "No action required. Keep the guard that made this stick.",
    };
  }

  const firstRecurrence = afterFix[0];
  const gap = daysBetween(lastFix.at, firstRecurrence.at);
  const newSurfaces = new Set(pagesAddedAfterFix);

  // Ordering matters. A revert is checked first because it is time-based and would
  // otherwise be misread as a missing guard; a new surface is checked before an
  // instance-level fix because appearing on a brand-new page is not evidence that the
  // original fix was misapplied.
  let cause: RecurrenceCause;

  if (gap <= REVERT_WINDOW_DAYS) {
    cause = "fix-reverted";
  } else if (afterFix.every((e) => newSurfaces.has(e.page))) {
    cause = "new-surface";
  } else if (afterFix.some((e) => e.page !== lastFix.page)) {
    cause = "fixed-at-instance";
  } else {
    cause = "no-regression-guard";
  }

  const EXPLANATIONS: Record<Exclude<RecurrenceCause, "never-fixed" | "resolved">, {
    explanation: string;
    action: string;
  }> = {
    "fix-reverted": {
      explanation:
        `Reappeared ${gap.toFixed(1)} days after the fix — too fast to be drift. The change ` +
        "was most likely reverted, lost in a merge, or only partially applied.",
      action:
        "Check the commit history for the fix rather than re-applying it. Re-fixing a " +
        "reverted change without finding out why it was reverted repeats the cycle.",
    },
    "new-surface": {
      explanation:
        "Only reappeared on pages created after the fix. The original fix held; new code " +
        "is not using the corrected component.",
      action:
        "The fix is fine — adoption is the problem. Add a lint rule or codemod so new " +
        "code cannot reintroduce the old pattern.",
    },
    "fixed-at-instance": {
      explanation:
        "Reappeared on a different page from the one that was fixed. The fix was applied " +
        "to one instance rather than to the shared source, so every other usage still " +
        "carries the defect.",
      action:
        "Fix the component, not the page. Then re-scan every page using it to confirm " +
        "the whole class is resolved.",
    },
    "no-regression-guard": {
      explanation:
        `Fixed at the source and returned on the same surface after ${gap.toFixed(0)} days. ` +
        "Nothing prevents reintroduction, so the defect will keep coming back.",
      action:
        "Make the defect impossible rather than fixing it a third time: a required prop, " +
        "a lint rule, or a test that fails when the pattern returns.",
    },
  };

  const detail = EXPLANATIONS[cause as keyof typeof EXPLANATIONS];

  return {
    cause,
    recurrences: afterFix.length,
    fixes: fixes.length,
    daysToRecurrence: Math.round(gap * 10) / 10,
    explanation: detail.explanation,
    recommendedAction: detail.action,
  };
}

// ── Aggregate queries ────────────────────────────────────────────────────────

export interface ComponentFailureRecord {
  component: string;
  /** Distinct issues attributed to this component. */
  issues: number;
  /** Total detections across all of them. */
  detections: number;
  /** Distinct pages affected. */
  pages: number;
  owner: string | null;
}

/**
 * Rank components by how much failure they actually cause.
 *
 * Ranking by raw detection count rewards components that appear on many pages, which
 * conflates BREADTH with BADNESS. A component with one defect on 200 pages is one fix;
 * a component with nine distinct defects on two pages is nine. Weighting distinct
 * issues above raw detections keeps the ranking pointed at the harder problem.
 */
export function rankComponentsByFailure(
  records: readonly ComponentFailureRecord[],
): ComponentFailureRecord[] {
  return [...records].sort(
    (a, b) =>
      b.issues - a.issues
      || b.pages - a.pages
      || b.detections - a.detections
      || a.component.localeCompare(b.component),
  );
}

export interface FixPrecedent {
  issueId: string;
  component: string;
  ruleId: string;
  /** Whether the fix held. Only durable precedents are worth copying. */
  heldFor: number | null;
  summary: string;
}

/**
 * Find fixes that solved comparable issues.
 *
 * Precedents whose fix did NOT hold are excluded rather than ranked lower. Suggesting a
 * fix that already failed elsewhere is worse than suggesting nothing: it carries the
 * authority of precedent while repeating a known mistake.
 */
export function findDurableFixPrecedents(
  ruleId: string,
  precedents: readonly FixPrecedent[],
  minDurableDays = 30,
): FixPrecedent[] {
  return precedents
    .filter((p) => p.ruleId === ruleId)
    .filter((p) => p.heldFor !== null && p.heldFor >= minDurableDays)
    .sort((a, b) => (b.heldFor ?? 0) - (a.heldFor ?? 0));
}
