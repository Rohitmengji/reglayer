/**
 * RegLayer — Component Context & Intervention Model
 *
 * Assembles the chain that turns a technical finding into a routed, prioritised action:
 *
 *   Component → pages using it → design system → WCAG mapping → historical issues
 *   → previous fixes → ownership → business impact
 *
 * WHAT ALREADY EXISTS: `KnowledgeEntity` / `KnowledgeEdge` model precisely these
 * relations (`violates`, `owns`, `fixed_by`, `part_of`, `governs`), and
 * `ai/graph/service.ts` can upsert, traverse, and search them.
 *
 * WHAT DOES NOT: `indexScan` — the only function that POPULATES the graph from scan
 * results — has no production caller. Meanwhile `buildGraphContext` runs inside the
 * retrieval pipeline on every RAG query, traversing a table nothing fills. The
 * retrieval test mocks it returning `{ entities: [], paths: [], context: "" }`, which is
 * also what production gets. The graph is queried but never written.
 *
 * This module supplies the reasoning that makes populating it worthwhile: given the
 * chain, what should actually be done, by whom, and in what order.
 *
 * THE CENTRAL INSIGHT: a component that has been FIXED REPEATEDLY and keeps regressing
 * is a different problem from one that has never been fixed. The first needs a systemic
 * intervention — a required prop, a lint rule, a design-system constraint — because
 * point fixes have already been tried and did not hold. Most tools recommend the same
 * fix a fourth time.
 */

export type BusinessTier = "revenue" | "core" | "support" | "marketing";

/**
 * Weighting by what the page does for the business.
 *
 * A broken control in checkout blocks a purchase and carries direct legal exposure; the
 * same control in a blog footer does not. Treating them identically is how remediation
 * backlogs get worked in the wrong order.
 */
const BUSINESS_WEIGHT: Record<BusinessTier, number> = {
  revenue: 3,
  core: 2,
  support: 1.25,
  marketing: 1,
};

export type Impact = "critical" | "serious" | "moderate" | "minor";

const IMPACT_WEIGHT: Record<Impact, number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
};

export interface ComponentContext {
  /** Component identity, e.g. "IconButton". */
  component: string;
  /** Design system it belongs to, when known. */
  designSystem: string | null;
  /** Distinct pages rendering this component. */
  pagesUsing: number;
  /** Highest business tier among the pages using it. */
  highestTier: BusinessTier;
  /** WCAG criteria this component has violated. */
  wcagCriteria: string[];
  worstImpact: Impact;
  /** Distinct occasions this component has produced violations. */
  historicalIssues: number;
  /** Times a fix has been applied to it. */
  previousFixes: number;
  /** Owning team or individual, for routing. */
  owner: string | null;
}

export type Intervention = "point-fix" | "component-fix" | "systemic";

export interface ComponentPriority {
  component: string;
  /** Higher is more urgent. Unbounded by design — it is an ordering, not a grade. */
  score: number;
  intervention: Intervention;
  /** Violations resolved per component fixed. */
  leverage: number;
  /** True when fixes have not held, so another point fix is unlikely to either. */
  systemicRisk: boolean;
  /** Who should receive this, or null when ownership is unknown. */
  routeTo: string | null;
  rationale: string;
}

/**
 * Whether a component's fixes keep failing.
 *
 * Requires BOTH prior fixes and continuing issues. A component fixed once that has not
 * recurred is a success story, not a risk — and flagging it as systemic would bury the
 * genuine cases.
 */
export function hasSystemicRisk(context: ComponentContext): boolean {
  return context.previousFixes >= 2 && context.historicalIssues > context.previousFixes;
}

/**
 * Choose the kind of intervention.
 *
 * The distinction is what makes this actionable. A one-page component gets a point fix.
 * A shared component gets fixed at the component. A shared component whose fixes keep
 * regressing needs the defect made IMPOSSIBLE — a required prop, a lint rule, a
 * design-system constraint — because repetition is evidence that fixing is not enough.
 */
export function chooseIntervention(context: ComponentContext): Intervention {
  if (hasSystemicRisk(context)) return "systemic";
  if (context.pagesUsing > 1) return "component-fix";
  return "point-fix";
}

export function prioritizeComponent(context: ComponentContext): ComponentPriority {
  const businessWeight = BUSINESS_WEIGHT[context.highestTier];
  const impactWeight = IMPACT_WEIGHT[context.worstImpact];

  // Reach is dampened with a log so a component on 400 pages does not drown out a
  // critical failure in checkout. Ordering should reflect both, not just breadth.
  const reach = 1 + Math.log2(Math.max(1, context.pagesUsing));

  const systemicRisk = hasSystemicRisk(context);
  // Repeated regressions raise urgency: the cost is not one fix but every fix already
  // spent here, plus the next one.
  const recurrenceMultiplier = systemicRisk ? 1.5 : 1;

  const score = Math.round(reach * businessWeight * impactWeight * recurrenceMultiplier * 10) / 10;
  const intervention = chooseIntervention(context);

  const rationaleParts = [
    `${context.pagesUsing} page${context.pagesUsing === 1 ? "" : "s"} affected`,
    `${context.highestTier} tier`,
    `${context.worstImpact} impact`,
  ];

  if (systemicRisk) {
    rationaleParts.push(
      `fixed ${context.previousFixes}× and still regressing — make the defect impossible ` +
      `rather than fixing it again`,
    );
  } else if (intervention === "component-fix" && context.designSystem) {
    rationaleParts.push(`owned by the ${context.designSystem} design system`);
  }

  return {
    component: context.component,
    score,
    intervention,
    // What a single component fix resolves. This is the number that justifies the work.
    leverage: context.pagesUsing,
    systemicRisk,
    routeTo: context.owner,
    rationale: rationaleParts.join("; "),
  };
}

/**
 * Order a set of components for a remediation backlog.
 *
 * Unowned components sort after equally-scored owned ones: work nobody can be assigned
 * stalls, and surfacing it above assignable work makes a backlog look busy while
 * nothing moves.
 */
export function buildRemediationOrder(
  contexts: readonly ComponentContext[],
): ComponentPriority[] {
  return contexts
    .map(prioritizeComponent)
    .sort((a, b) =>
      b.score - a.score
      || Number(Boolean(b.routeTo)) - Number(Boolean(a.routeTo))
      || a.component.localeCompare(b.component),
    );
}

/** Components with no owner, which need routing before they can be scheduled. */
export function unroutedComponents(priorities: readonly ComponentPriority[]): string[] {
  return priorities.filter((p) => p.routeTo === null).map((p) => p.component);
}
