/**
 * ---------------------------------------------------------
 * RegLayer — Adversarial Agent Runner (server-only)
 * ---------------------------------------------------------
 *
 * WHY: Executes an autonomous AI agent that ATTEMPTS to complete a goal
 *      on a real website while constrained by a disability persona.
 *
 * WHAT: Launches Playwright, builds a perception of the page (visual or
 *      accessibility-tree-only), asks the LLM for the next action, enforces
 *      persona constraints, executes the action, and loops until goal
 *      completion or failure.
 *
 * HOW: The LLM receives ONLY what the persona can perceive (e.g. a screen
 *      reader user gets only the a11y tree, not the visual layout). The
 *      constraint engine BLOCKS actions the persona cannot perform (e.g.
 *      keyboard user cannot click). When the agent gets stuck — that's a
 *      real accessibility barrier discovered.
 * ---------------------------------------------------------
 */

import "server-only";

import { type Page, type Browser } from "playwright-core";
import { launchBrowser, isServerless } from "@/lib/scanner/browser/launch";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";
import OpenAI from "openai";
import {
  PERSONA_CONSTRAINTS,
  enforceConstraints,
  getPerception,
  updateCognitiveState,
  type AgentPersona,
  type ActionProposal,
  type CognitiveState,
  type PersonaConstraints,
} from "./personas";

const log = logger.withContext({ module: "adversarial-agent" });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentRunConfig {
  runId: string;
  workspaceId: string;
  siteId: string;
  persona: AgentPersona;
  goal: string;
  startUrl: string;
  maxSteps?: number;
}

interface StepRecord {
  stepIndex: number;
  action: string;
  target: string | null;
  reasoning: string | null;
  outcome: "PASSED" | "FAILED" | "SKIPPED" | "TIMEOUT";
  annotation: string | null;
  duration: number;
}

export interface AgentRunResult {
  goalAchieved: boolean;
  totalSteps: number;
  failedAtStep: number | null;
  failureReason: string | null;
  duration: number;
  barriers: Barrier[];
  steps: StepRecord[];
}

interface Barrier {
  stepIndex: number;
  element: string;
  persona: AgentPersona;
  reason: string;
  wcagCriteria: string | null;
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

const MAX_STEPS = 25;
const STEP_TIMEOUT_MS = 15_000;

/**
 * Execute an adversarial agent run. Call this from the API route or cron.
 * Persists step-by-step results to the database as it runs.
 */
export async function executeAgentRun(config: AgentRunConfig): Promise<AgentRunResult> {
  const constraints = PERSONA_CONSTRAINTS[config.persona];
  const perception = getPerception(config.persona);
  const maxSteps = config.maxSteps ?? MAX_STEPS;
  const startTime = Date.now();

  const steps: StepRecord[] = [];
  const barriers: Barrier[] = [];
  let goalAchieved = false;
  let failedAtStep: number | null = null;
  let failureReason: string | null = null;

  // Mark run as started
  await prisma.agentRun.update({
    where: { id: config.runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Launch browser with persona-appropriate settings
    browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: {
        width: Math.round(1280 / constraints.viewportZoom),
        height: Math.round(720 / constraints.viewportZoom),
      },
      deviceScaleFactor: constraints.viewportZoom,
      colorScheme: constraints.highContrastMode ? "dark" : "light",
      forcedColors: constraints.highContrastMode ? "active" : "none",
    });
    page = await context.newPage();

    // Navigate to start URL
    await page.goto(config.startUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });

    let cognitiveState: CognitiveState = {
      totalSteps: 0,
      decisionsThisPage: 0,
      fatigued: false,
      overwhelmed: false,
    };

    // Agent loop
    for (let step = 0; step < maxSteps; step++) {
      if (Date.now() - startTime > constraints.totalTimeoutMs) {
        failureReason = "Total timeout exceeded";
        failedAtStep = step;
        break;
      }

      // Motor persona: simulate input delay
      if (constraints.maxInputDelay > 0) {
        await page.waitForTimeout(Math.min(constraints.maxInputDelay, 1000));
      }

      // Build page perception for the LLM
      const pageState = await buildPagePerception(page, perception);

      // Count interactive elements for cognitive tracking
      const interactiveCount = await page.locator(
        "a, button, input, select, textarea, [role='button'], [role='link'], [tabindex]"
      ).count();

      cognitiveState = updateCognitiveState(config.persona, cognitiveState, interactiveCount);

      // Cognitive overload check
      if (cognitiveState.overwhelmed && config.persona === "COGNITIVE") {
        barriers.push({
          stepIndex: step,
          element: "page",
          persona: config.persona,
          reason: `Page has ${interactiveCount} interactive elements — exceeds cognitive threshold of ${constraints.maxDecisionsPerPage}`,
          wcagCriteria: "3.2.6",
        });
      }
      if (cognitiveState.fatigued && config.persona === "COGNITIVE") {
        failureReason = `Cognitive fatigue: ${cognitiveState.totalSteps} steps exceeds threshold of ${constraints.maxStepsBeforeFatigue}`;
        failedAtStep = step;
        break;
      }

      // Ask the LLM: what's the next action?
      const llmResponse = await askAgent(config, pageState, steps, cognitiveState);

      if (llmResponse.goalComplete) {
        goalAchieved = true;
        steps.push({
          stepIndex: step,
          action: "goal_complete",
          target: null,
          reasoning: llmResponse.reasoning,
          outcome: "PASSED",
          annotation: "Goal achieved successfully",
          duration: 0,
        });
        break;
      }

      if (llmResponse.stuck) {
        failureReason = llmResponse.reasoning || "Agent is stuck — no viable next action";
        failedAtStep = step;
        barriers.push({
          stepIndex: step,
          element: llmResponse.target || "unknown",
          persona: config.persona,
          reason: failureReason,
          wcagCriteria: llmResponse.wcagCriteria || null,
        });
        steps.push({
          stepIndex: step,
          action: "stuck",
          target: llmResponse.target || null,
          reasoning: llmResponse.reasoning,
          outcome: "FAILED",
          annotation: failureReason,
          duration: 0,
        });
        break;
      }

      // Enforce persona constraints on the proposed action
      const proposal: ActionProposal = {
        type: llmResponse.action as ActionProposal["type"],
        key: llmResponse.key,
        selector: llmResponse.target || undefined,
        targetSize: llmResponse.targetSize,
      };
      const violations = enforceConstraints(config.persona, proposal);
      const blocked = violations.filter((v) => v.blocked);

      if (blocked.length > 0) {
        // The action the agent WANTS to take is blocked by persona constraints
        // This means the site REQUIRES that action — it's a barrier
        const blockReason = blocked.map((v) => v.description).join("; ");
        barriers.push({
          stepIndex: step,
          element: llmResponse.target || "unknown",
          persona: config.persona,
          reason: blockReason,
          wcagCriteria: inferWcag(config.persona, proposal.type),
        });
        failureReason = blockReason;
        failedAtStep = step;
        steps.push({
          stepIndex: step,
          action: llmResponse.action,
          target: llmResponse.target || null,
          reasoning: llmResponse.reasoning,
          outcome: "FAILED",
          annotation: blockReason,
          duration: 0,
        });
        break;
      }

      // Execute the action
      const stepStart = Date.now();
      try {
        await executeAction(page, llmResponse, constraints);
        const stepDuration = Date.now() - stepStart;
        steps.push({
          stepIndex: step,
          action: llmResponse.action,
          target: llmResponse.target || null,
          reasoning: llmResponse.reasoning,
          outcome: "PASSED",
          annotation: null,
          duration: stepDuration,
        });
      } catch (err) {
        const stepDuration = Date.now() - stepStart;
        const errMsg = err instanceof Error ? err.message : "Action failed";
        steps.push({
          stepIndex: step,
          action: llmResponse.action,
          target: llmResponse.target || null,
          reasoning: llmResponse.reasoning,
          outcome: "FAILED",
          annotation: errMsg,
          duration: stepDuration,
        });
        if (stepDuration > STEP_TIMEOUT_MS) {
          failureReason = `Step timed out: ${errMsg}`;
          failedAtStep = step;
          break;
        }
      }

      // Brief stabilization wait
      await page.waitForTimeout(300);
    }

    if (!goalAchieved && !failureReason) {
      failureReason = `Max steps (${maxSteps}) reached without completing goal`;
      failedAtStep = steps.length - 1;
    }
  } catch (err) {
    failureReason = `Infrastructure error: ${err instanceof Error ? err.message : "Unknown"}`;
    log.error("Agent run crashed", { runId: config.runId, error: failureReason });
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  const duration = Date.now() - startTime;
  const result: AgentRunResult = {
    goalAchieved,
    totalSteps: steps.length,
    failedAtStep,
    failureReason,
    duration,
    barriers,
    steps,
  };

  // Persist results
  await prisma.agentRun.update({
    where: { id: config.runId },
    data: {
      status: failureReason?.startsWith("Infrastructure") ? "FAILED" : "COMPLETED",
      goalAchieved,
      totalSteps: steps.length,
      failedAtStep,
      failureReason,
      duration,
      barriers: barriers as unknown as undefined, // Prisma Json
      completedAt: new Date(),
    },
  });

  // Persist individual steps
  if (steps.length > 0) {
    await prisma.agentStep.createMany({
      data: steps.map((s) => ({
        runId: config.runId,
        stepIndex: s.stepIndex,
        action: s.action,
        target: s.target,
        reasoning: s.reasoning,
        outcome: s.outcome,
        annotation: s.annotation,
        duration: s.duration,
      })),
    });
  }

  return result;
}

// ─── LLM Integration ─────────────────────────────────────────────────────────

interface LLMResponse {
  action: string;
  target: string | null;
  key?: string;
  reasoning: string;
  goalComplete: boolean;
  stuck: boolean;
  targetSize?: { width: number; height: number };
  wcagCriteria?: string;
}

async function askAgent(
  config: AgentRunConfig,
  pageState: string,
  previousSteps: StepRecord[],
  cognitive: CognitiveState
): Promise<LLMResponse> {
  const constraints = PERSONA_CONSTRAINTS[config.persona];
  const openai = new OpenAI();

  const stepHistory = previousSteps.slice(-5).map(
    (s) => `Step ${s.stepIndex}: ${s.action} on "${s.target}" → ${s.outcome}${s.annotation ? ` (${s.annotation})` : ""}`
  ).join("\n");

  const prompt = `You are an accessibility testing agent simulating a ${constraints.label}.
Your constraints: ${constraints.description}

GOAL: ${config.goal}
CURRENT URL: Will be provided in page state.

${constraints.allowMouse ? "" : "CRITICAL: You CANNOT use mouse clicks or hover. Only keyboard navigation (Tab, Enter, Space, Arrow keys, Escape)."}
${!constraints.canSeeVisualContent ? "CRITICAL: You can ONLY perceive the accessibility tree below. You CANNOT see visual layout, colors, or images." : ""}
${cognitive.overwhelmed ? `WARNING: This page has too many interactive elements (${cognitive.decisionsThisPage}) for your cognitive capacity.` : ""}

RECENT STEPS:
${stepHistory || "(none yet)"}

CURRENT PAGE STATE:
${pageState}

Based on your persona constraints and the goal, what is your next action?

Respond in JSON:
{
  "action": "click|type|press|navigate|scroll|wait",
  "target": "CSS selector or element description",
  "key": "key name if action is press",
  "text": "text to type if action is type",
  "reasoning": "why you chose this action",
  "goalComplete": true/false,
  "stuck": true/false (set true if you cannot proceed due to an accessibility barrier)
}

If stuck, explain what barrier prevents you from proceeding. If goalComplete, explain how you verified success.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { action: "wait", target: null, reasoning: "No LLM response", goalComplete: false, stuck: true };

    const parsed = JSON.parse(content);
    return {
      action: parsed.action || "wait",
      target: parsed.target || null,
      key: parsed.key,
      reasoning: parsed.reasoning || "",
      goalComplete: Boolean(parsed.goalComplete),
      stuck: Boolean(parsed.stuck),
      wcagCriteria: parsed.wcagCriteria,
    };
  } catch (err) {
    log.warn("LLM call failed in agent run", { error: err instanceof Error ? err.message : "Unknown" });
    return { action: "wait", target: null, reasoning: "LLM error", goalComplete: false, stuck: true };
  }
}

// ─── Page Perception Builder ─────────────────────────────────────────────────

async function buildPagePerception(
  page: Page,
  perception: ReturnType<typeof getPerception>
): Promise<string> {
  const url = page.url();
  const title = await page.title();
  let output = `URL: ${url}\nTitle: ${title}\n\n`;

  if (perception.includeAccessibilityTree) {
    // Get the accessibility tree via aria snapshot (Playwright 1.49+)
    try {
      const ariaSnapshot = await page.locator("body").ariaSnapshot();
      if (ariaSnapshot) {
        output += "ACCESSIBILITY TREE:\n" + ariaSnapshot + "\n\n";
      }
    } catch {
      // Fallback: use evaluate to get basic a11y info
      output += "ACCESSIBILITY TREE: (unavailable)\n\n";
    }
  }

  if (perception.includeVisualLayout) {
    // Get a simplified DOM structure (interactive elements only)
    const interactives = await page.evaluate(() => {
      const els = document.querySelectorAll(
        "a, button, input, select, textarea, [role='button'], [role='link'], [tabindex], h1, h2, h3, h4, h5, h6, [aria-label], nav, main, form"
      );
      return Array.from(els).slice(0, 50).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          text: (el.textContent || "").trim().slice(0, 60),
          ariaLabel: el.getAttribute("aria-label") || "",
          href: el.getAttribute("href") || "",
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          disabled: (el as HTMLElement).hasAttribute("disabled"),
          visible: rect.width > 0 && rect.height > 0,
          size: { width: Math.round(rect.width), height: Math.round(rect.height) },
        };
      });
    });
    output += "INTERACTIVE ELEMENTS:\n" + interactives.map((el, i) =>
      `[${i}] <${el.tag}${el.role ? ` role="${el.role}"` : ""}${el.ariaLabel ? ` aria-label="${el.ariaLabel}"` : ""}${el.href ? ` href="${el.href}"` : ""}${el.type ? ` type="${el.type}"` : ""}${el.disabled ? " disabled" : ""}> "${el.text}" (${el.size.width}×${el.size.height}px)`
    ).join("\n");
  }

  return output.slice(0, 8000); // Cap context size
}

function formatA11yTree(node: { role?: string; name?: string; children?: unknown[] }, depth: number): string {
  const indent = "  ".repeat(depth);
  let line = `${indent}[${node.role || "unknown"}] "${node.name || ""}"`;
  const children = node.children as Array<{ role?: string; name?: string; children?: unknown[] }> | undefined;
  if (children) {
    line += "\n" + children.map((c) => formatA11yTree(c, depth + 1)).join("\n");
  }
  return line;
}

// ─── Action Execution ────────────────────────────────────────────────────────

async function executeAction(
  page: Page,
  action: LLMResponse,
  constraints: PersonaConstraints
): Promise<void> {
  const timeout = constraints.stepTimeoutMs;

  switch (action.action) {
    case "click":
      if (action.target) {
        await page.click(action.target, { timeout });
      }
      break;
    case "type":
      if (action.target) {
        await page.fill(action.target, (action as unknown as { text?: string }).text || "", { timeout });
      }
      break;
    case "press":
      if (action.key) {
        await page.keyboard.press(action.key);
      }
      break;
    case "navigate":
      if (action.target) {
        await page.goto(action.target, { waitUntil: "domcontentloaded", timeout: 15000 });
      }
      break;
    case "scroll":
      await page.mouse.wheel(0, 300);
      break;
    case "wait":
      await page.waitForTimeout(1000);
      break;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferWcag(persona: AgentPersona, actionType: string): string | null {
  if (persona === "KEYBOARD" && actionType === "click") return "2.1.1"; // Keyboard accessible
  if (persona === "SCREEN_READER") return "4.1.2"; // Name, Role, Value
  if (persona === "MOTOR" && actionType === "click") return "2.5.8"; // Target size
  if (persona === "COGNITIVE") return "3.2.6"; // Consistent help
  return null;
}
