/**
 * RegLayer — Golden dataset grader
 *
 * WHY DETERMINISTIC: the usual approach is an LLM-as-judge, which costs money per run,
 * is non-reproducible, and makes the evaluator itself a source of hallucination. WCAG is
 * a numbered specification with exactly one right answer per criterion, and
 * `lib/ai/safety/wcag-fact-check.ts` already holds the ground truth. So grading is
 * string and set operations — free, instant, and identical on every run.
 *
 * That last property is what makes this usable as a CI gate: a score that moves when
 * nothing changed cannot gate anything.
 *
 * SCORING SHAPE: a case is graded on independent checks, each pass/fail. The case score
 * is the fraction passed, EXCEPT that a hallucinated criterion forces the score to 0.
 * A fabricated criterion number is not a partial failure — it is the specific defect
 * this product cannot ship, so it is not allowed to average away against correct facts.
 */
import type { GoldenCase } from "./golden-dataset";
import { factCheckWcagResponse, lookupCriterion } from "@/lib/ai/safety/wcag-fact-check";

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface CaseGrade {
  caseId: string;
  category: GoldenCase["category"];
  /** 0-1. Forced to 0 when a hallucinated criterion is present. */
  score: number;
  hallucinated: string[];
  checks: CheckResult[];
}

export interface EvalReport {
  total: number;
  /** Mean case score, 0-1. */
  score: number;
  /** Cases containing at least one fabricated criterion. */
  hallucinationCount: number;
  perCategory: Record<string, { count: number; score: number; hallucinations: number }>;
  grades: CaseGrade[];
}

const norm = (s: string) => s.toLowerCase();

/** Extract criterion IDs referenced in a response. */
function citedCriteria(response: string): Set<string> {
  const out = new Set<string>();
  for (const m of response.matchAll(/\b(\d\.\d\.\d{1,2})\b/g)) out.add(m[1]);
  return out;
}

/**
 * Grade one response against one case.
 *
 * `response` is whatever the model produced; nothing about the model is assumed, so the
 * same grader works for any provider or prompt version.
 */
export function gradeCase(testCase: GoldenCase, response: string): CaseGrade {
  const checks: CheckResult[] = [];
  const lower = norm(response);
  const cited = citedCriteria(response);

  // Hallucination is evaluated by the same checker that runs in production guardrails,
  // so an improvement here is an improvement to the live safety net, not a parallel
  // implementation that can drift from it.
  const factCheck = factCheckWcagResponse(response);
  const hallucinated = factCheck.claims.filter((c) => !c.valid).map((c) => c.criterion);

  if (testCase.expectRefusal) {
    // For traps, the ONLY correct behaviour is to not affirm a criterion that does not
    // exist. Any citation is a failure — including inventing a different real one to
    // fill the gap.
    const affirmed = cited.size > 0;
    checks.push({
      name: "declines-nonexistent-criterion",
      passed: !affirmed,
      detail: affirmed ? `cited ${[...cited].join(", ")} for a criterion that does not exist` : undefined,
    });
  }

  for (const id of testCase.mustCite ?? []) {
    const passed = cited.has(id);
    checks.push({ name: `cites-${id}`, passed, detail: passed ? undefined : `expected ${id}` });
  }

  for (const id of testCase.mustNotCite ?? []) {
    const passed = !cited.has(id);
    checks.push({ name: `avoids-${id}`, passed, detail: passed ? undefined : `wrongly cited ${id}` });
  }

  for (const needle of testCase.mustContain ?? []) {
    const passed = lower.includes(norm(needle));
    checks.push({ name: `contains-${needle}`, passed, detail: passed ? undefined : `missing "${needle}"` });
  }

  for (const needle of testCase.mustNotContain ?? []) {
    const passed = !lower.includes(norm(needle));
    checks.push({ name: `excludes-${needle}`, passed, detail: passed ? undefined : `contained "${needle}"` });
  }

  if (testCase.expectLevel) {
    const { criterion, level } = testCase.expectLevel;
    const official = lookupCriterion(criterion);
    // A level mismatch reported by the production fact-checker is authoritative.
    const mismatch = factCheck.claims.find((c) => c.criterion === criterion)?.levelMismatch;
    const statesLevel = new RegExp(`\\blevel\\s+${level}\\b|\\b${level}\\b`, "i").test(response);
    const passed = !mismatch && statesLevel && official?.level === level;
    checks.push({
      name: `level-${criterion}-is-${level}`,
      passed,
      detail: passed
        ? undefined
        : mismatch
          ? `claimed level ${mismatch.claimed}, actual ${mismatch.actual}`
          : `did not state level ${level}`,
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const rawScore = checks.length === 0 ? 1 : passedCount / checks.length;

  return {
    caseId: testCase.id,
    category: testCase.category,
    // Hard zero on hallucination — see module docblock.
    score: hallucinated.length > 0 ? 0 : rawScore,
    hallucinated,
    checks,
  };
}

/** Aggregate grades into a report suitable for CI output or prompt-version comparison. */
export function buildReport(grades: CaseGrade[]): EvalReport {
  const perCategory: EvalReport["perCategory"] = {};

  for (const g of grades) {
    const bucket = (perCategory[g.category] ??= { count: 0, score: 0, hallucinations: 0 });
    bucket.count += 1;
    bucket.score += g.score;
    if (g.hallucinated.length > 0) bucket.hallucinations += 1;
  }

  for (const bucket of Object.values(perCategory)) {
    bucket.score = bucket.count === 0 ? 0 : bucket.score / bucket.count;
  }

  return {
    total: grades.length,
    score: grades.length === 0 ? 0 : grades.reduce((s, g) => s + g.score, 0) / grades.length,
    hallucinationCount: grades.filter((g) => g.hallucinated.length > 0).length,
    perCategory,
    grades,
  };
}

/** Human-readable summary for CI logs and PR comments. */
export function formatReport(report: EvalReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [
    `Golden dataset: ${report.total} cases`,
    `Overall score:  ${pct(report.score)}`,
    `Hallucinations: ${report.hallucinationCount} case(s)`,
    "",
    "By category:",
  ];

  for (const [category, s] of Object.entries(report.perCategory).sort()) {
    lines.push(`  ${category.padEnd(18)} ${pct(s.score).padStart(6)}  (${s.count} cases${s.hallucinations ? `, ${s.hallucinations} hallucinating` : ""})`);
  }

  const failures = report.grades.filter((g) => g.score < 1);
  if (failures.length > 0) {
    lines.push("", "Failing cases:");
    for (const g of failures) {
      const why = g.hallucinated.length > 0
        ? `HALLUCINATED ${g.hallucinated.join(", ")}`
        : g.checks.filter((c) => !c.passed).map((c) => c.detail ?? c.name).join("; ");
      lines.push(`  ${g.caseId.padEnd(34)} ${pct(g.score).padStart(6)}  ${why}`);
    }
  }

  return lines.join("\n");
}
