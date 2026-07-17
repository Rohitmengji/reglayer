/**
 * RegLayer — Workflow Builder
 *
 * WHY:  Phase 7 workflows are code-defined. This builder allows workflows
 *       to be composed from reusable step templates via configuration.
 *       Users pick steps, connect them, set conditions — no code needed.
 *
 * HOW:  A WorkflowTemplate is JSON that describes:
 *       - Which steps to run (from a library of reusable step types)
 *       - How they connect (next step, conditional routing)
 *       - Input/output mapping between steps
 *       The builder compiles templates into executable WorkflowDefinitions.
 *
 * STEP TYPES (reusable building blocks):
 *   - fetch_scan: Load scan data from DB
 *   - ai_generate: Call LLM with a prompt
 *   - evaluate: Check conditions (score thresholds, violation counts)
 *   - notify: Send notification (email, webhook)
 *   - transform: Reshape data between steps
 */

import "server-only";

import type { WorkflowDefinition, WorkflowState, WorkflowStep } from "./types";
import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";

// ── Step Type Registry ────────────────────────────────────────────────────────

export type StepType = "fetch_scan" | "ai_generate" | "evaluate" | "notify" | "transform";

export interface StepTemplate {
  id: string;
  type: StepType;
  name: string;
  config: Record<string, unknown>;
  /** Next step ID or conditional: { condition: "data.score >= 90", then: "step_a", else: "step_b" } */
  next?: string | { condition: string; then: string | null; else: string | null };
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: StepTemplate[];
  entryStep: string;
  maxDurationMs?: number;
}

// ── Step Executors ────────────────────────────────────────────────────────────

function createFetchScanStep(template: StepTemplate): WorkflowStep {
  return {
    id: template.id,
    name: template.name,
    description: "Fetch scan data from database",
    execute: async (state: WorkflowState) => {
      const url = (template.config.url as string) ?? (state.data.url as string);
      const workspaceId = state.triggeredBy.workspaceId;

      const scan = await prisma.scan.findFirst({
        where: {
          url: { contains: url?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "" },
          ...(workspaceId ? { workspaceId } : {}),
          status: "COMPLETED",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, url: true, score: true, totalViolations: true,
          critical: true, serious: true, moderate: true, minor: true,
        },
      });

      return {
        ...state,
        data: { ...state.data, scan: scan ?? null, hasScan: !!scan },
      };
    },
  };
}

function createAiGenerateStep(template: StepTemplate): WorkflowStep {
  return {
    id: template.id,
    name: template.name,
    description: "Generate AI content",
    execute: async (state: WorkflowState) => {
      const modelId = getDefaultModelId();
      if (!modelId) {
        return { ...state, data: { ...state.data, [`${template.id}_output`]: "AI unavailable" } };
      }

      const prompt = (template.config.prompt as string) ?? "Summarize the data.";
      // Replace {{data.xxx}} references in the prompt
      const resolvedPrompt = prompt.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
        const value = key.split(".").reduce((obj: unknown, k: string) => (obj as Record<string, unknown>)?.[k], state.data);
        return value !== undefined ? String(value) : "";
      });

      const result = await complete({
        model: modelId,
        messages: [
          { role: "system", content: (template.config.systemPrompt as string) ?? "You are a helpful assistant." },
          { role: "user", content: resolvedPrompt },
        ],
        temperature: (template.config.temperature as number) ?? 0.4,
        maxTokens: (template.config.maxTokens as number) ?? 1000,
        metadata: { feature: "workflow-builder", userId: state.triggeredBy.userId },
      });

      return {
        ...state,
        data: { ...state.data, [`${template.id}_output`]: result?.content ?? "Generation failed" },
      };
    },
  };
}

function createEvaluateStep(template: StepTemplate): WorkflowStep {
  return {
    id: template.id,
    name: template.name,
    description: "Evaluate condition",
    execute: async (state: WorkflowState) => {
      // Simple condition evaluation: check thresholds
      const field = template.config.field as string;
      const operator = template.config.operator as string;
      const threshold = template.config.threshold as number;

      const value = field.split(".").reduce((obj: unknown, k: string) => (obj as Record<string, unknown>)?.[k], state.data);
      const numValue = Number(value);

      let result = false;
      switch (operator) {
        case ">=": result = numValue >= threshold; break;
        case "<=": result = numValue <= threshold; break;
        case ">": result = numValue > threshold; break;
        case "<": result = numValue < threshold; break;
        case "==": result = numValue === threshold; break;
        default: result = false;
      }

      return { ...state, data: { ...state.data, [`${template.id}_result`]: result } };
    },
    next: (state: WorkflowState) => {
      const result = state.data[`${template.id}_result`];
      if (typeof template.next === "object" && template.next) {
        return result ? (template.next.then ?? null) : (template.next.else ?? null);
      }
      return typeof template.next === "string" ? template.next : null;
    },
  };
}

function createNotifyStep(template: StepTemplate): WorkflowStep {
  return {
    id: template.id,
    name: template.name,
    description: "Send notification",
    execute: async (state: WorkflowState) => {
      // Log notification (actual email/webhook implementation deferred)
      const message = (template.config.message as string) ?? "Workflow completed";
      logger.info(`[workflow-notify] ${message}`, { runId: state.runId });
      return { ...state, data: { ...state.data, notified: true } };
    },
  };
}

function createTransformStep(template: StepTemplate): WorkflowStep {
  return {
    id: template.id,
    name: template.name,
    description: "Transform data",
    execute: async (state: WorkflowState) => {
      // Map fields from state.data to new keys
      const mappings = template.config.mappings as Record<string, string> | undefined;
      if (!mappings) return state;

      const transformed: Record<string, unknown> = {};
      for (const [target, source] of Object.entries(mappings)) {
        transformed[target] = source.split(".").reduce(
          (obj: unknown, k: string) => (obj as Record<string, unknown>)?.[k], state.data,
        );
      }
      return { ...state, data: { ...state.data, ...transformed } };
    },
  };
}

// ── Compiler ──────────────────────────────────────────────────────────────────

/**
 * Compile a workflow template into an executable WorkflowDefinition.
 * This is the bridge between user-created templates and the runtime engine.
 */
export function compileWorkflow(template: WorkflowTemplate): WorkflowDefinition {
  const steps: WorkflowStep[] = template.steps.map((stepTemplate) => {
    switch (stepTemplate.type) {
      case "fetch_scan": return createFetchScanStep(stepTemplate);
      case "ai_generate": return createAiGenerateStep(stepTemplate);
      case "evaluate": return createEvaluateStep(stepTemplate);
      case "notify": return createNotifyStep(stepTemplate);
      case "transform": return createTransformStep(stepTemplate);
    }
  });

  // Wire up sequential next pointers for steps without custom routing
  for (let i = 0; i < steps.length; i++) {
    const tmpl = template.steps[i];
    if (!steps[i].next && typeof tmpl.next === "string") {
      const nextId = tmpl.next;
      steps[i] = { ...steps[i], next: () => nextId };
    }
  }

  return {
    id: template.id as WorkflowDefinition["id"],
    name: template.name,
    description: template.description,
    steps,
    entryStep: template.entryStep,
    maxDurationMs: template.maxDurationMs,
  };
}
