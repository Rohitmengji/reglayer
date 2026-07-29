/**
 * RegLayer — Golden dataset evaluation runner
 *
 * Usage:
 *   npm run eval:prompts                 # default model, chat-system prompt
 *   npm run eval:prompts -- --model gpt-4o
 *   npm run eval:prompts -- --prompt chat-rag
 *   npm run eval:prompts -- --category trap        # focus one category
 *   npm run eval:prompts -- --baseline eval-baseline.json   # compare against a saved run
 *   npm run eval:prompts -- --save eval-baseline.json       # record a new baseline
 *
 * WHY THIS IS A SCRIPT AND NOT A CI TEST:
 *   It makes real model calls — it costs money, needs API keys, and its result depends
 *   on a third party. A gate with those properties fails for reasons unrelated to the
 *   change under review, and a flaky gate is quickly ignored.
 *
 *   The CI-safe half lives in src/__tests__/ai-eval.test.ts: it validates the dataset
 *   and the grader deterministically, with no network. This script is what you run
 *   BEFORE shipping a prompt change, and what feeds AiExperiment when comparing
 *   prompt versions.
 *
 * EXIT CODE: non-zero when any hallucination is detected, or when a baseline is
 * supplied and the score regressed. That makes it usable as a manual release gate.
 */
import "dotenv/config";
import * as fs from "node:fs";
import { GOLDEN_CASES, type GoldenCase } from "../src/lib/ai/eval/golden-dataset";
import { gradeCase, buildReport, formatReport, type CaseGrade, type EvalReport } from "../src/lib/ai/eval/grader";
import { complete, getDefaultModelId } from "../src/lib/ai/gateway";
import { getPrompt } from "../src/lib/ai/prompts/registry";
import type { ModelId } from "../src/lib/ai/gateway/types";
import type { PromptId } from "../src/lib/ai/prompts/types";

interface Args {
  model?: string;
  prompt: string;
  category?: string;
  baseline?: string;
  save?: string;
  concurrency: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    model: get("--model"),
    prompt: get("--prompt") ?? "chat-system",
    category: get("--category"),
    baseline: get("--baseline"),
    save: get("--save"),
    concurrency: Number(get("--concurrency") ?? 4),
  };
}

/** Run cases with bounded concurrency so a 30-case run doesn't trip provider rate limits. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    }),
  );

  return results;
}

async function runCase(testCase: GoldenCase, model: ModelId, systemPrompt: string): Promise<CaseGrade> {
  try {
    const response = await complete({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: testCase.question },
      ],
      // Low temperature: we are measuring factual accuracy, and sampling noise would
      // show up as score movement that has nothing to do with the prompt change.
      temperature: 0,
      maxTokens: 600,
      metadata: { feature: "eval-golden" },
    });

    if (!response) {
      return {
        caseId: testCase.id,
        category: testCase.category,
        score: 0,
        hallucinated: [],
        checks: [{ name: "provider-available", passed: false, detail: "no provider configured" }],
      };
    }

    return gradeCase(testCase, response.content);
  } catch (error) {
    return {
      caseId: testCase.id,
      category: testCase.category,
      score: 0,
      hallucinated: [],
      checks: [{
        name: "request-succeeded",
        passed: false,
        detail: error instanceof Error ? error.message : "unknown error",
      }],
    };
  }
}

function compareToBaseline(current: EvalReport, baselinePath: string): boolean {
  if (!fs.existsSync(baselinePath)) {
    console.log(`\nNo baseline at ${baselinePath} — skipping comparison.`);
    return true;
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as EvalReport;
  const delta = current.score - baseline.score;
  const sign = delta >= 0 ? "+" : "";

  console.log(`\nBaseline: ${(baseline.score * 100).toFixed(1)}%  →  Current: ${(current.score * 100).toFixed(1)}%  (${sign}${(delta * 100).toFixed(1)} pts)`);

  const regressed = current.grades.filter((g) => {
    const before = baseline.grades.find((b) => b.caseId === g.caseId);
    return before && g.score < before.score;
  });

  if (regressed.length > 0) {
    console.log(`\nRegressed cases (${regressed.length}):`);
    for (const g of regressed) console.log(`  ${g.caseId}`);
  }

  return delta >= 0 && regressed.length === 0;
}

async function main() {
  const args = parseArgs();

  const model = (args.model ?? getDefaultModelId()) as ModelId | null;
  if (!model) {
    console.error("No AI provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.");
    process.exit(1);
  }

  const template = getPrompt(args.prompt as PromptId);
  const systemPrompt = template.system;

  const cases = args.category
    ? GOLDEN_CASES.filter((c) => c.category === args.category)
    : GOLDEN_CASES;

  if (cases.length === 0) {
    console.error(`No cases matched category "${args.category}".`);
    process.exit(1);
  }

  console.log(`Model:  ${model}`);
  console.log(`Prompt: ${args.prompt}@v${template.version}`);
  console.log(`Cases:  ${cases.length}\n`);

  const started = Date.now();
  const grades = await mapLimit(cases, args.concurrency, (c) => runCase(c, model, systemPrompt));
  const report = buildReport(grades);

  console.log(formatReport(report));
  console.log(`\nCompleted in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (args.save) {
    fs.writeFileSync(args.save, JSON.stringify(report, null, 2));
    console.log(`Baseline written to ${args.save}`);
  }

  let ok = report.hallucinationCount === 0;
  if (!ok) {
    console.error(`\nFAIL: ${report.hallucinationCount} case(s) contained fabricated WCAG criteria.`);
  }

  if (args.baseline) {
    ok = compareToBaseline(report, args.baseline) && ok;
  }

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
