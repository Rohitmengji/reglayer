/**
 * RegLayer — Compliance Audit Workflow
 *
 * A multi-step workflow that:
 *   1. Validates the target URL
 *   2. Scans the site for accessibility violations
 *   3. Evaluates compliance against WCAG criteria
 *   4. Branches: if score >= 90 → generate certificate, else → remediation plan
 *   5. Generates an AI-powered remediation plan (prioritized by impact)
 *   6. Summarizes results
 *
 * This is the kind of workflow a customer would trigger from the dashboard:
 * "Run a full compliance audit on our site and tell me what to fix."
 */

import type { WorkflowDefinition, WorkflowState } from "./types";
import { prisma } from "@/lib/database/prisma";
import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import { getPrompt } from "@/lib/ai/prompts/registry";

// ── Step: Validate Input ──────────────────────────────────────────────────────

const validateInput = {
  id: "validate",
  name: "Validate Input",
  description: "Ensure the target URL is valid and accessible",
  execute: async (state: WorkflowState): Promise<WorkflowState> => {
    const url = state.data.url as string | undefined;
    if (!url) {
      return { ...state, status: "failed", error: "No URL provided" };
    }

    try {
      new URL(url);
    } catch {
      return { ...state, status: "failed", error: `Invalid URL: ${url}` };
    }

    return { ...state, data: { ...state.data, url, validated: true } };
  },
};

// ── Step: Fetch Scan Results ──────────────────────────────────────────────────

const fetchScanResults = {
  id: "fetch-scan",
  name: "Fetch Scan Results",
  description: "Retrieve the most recent scan for this URL from the database",
  execute: async (state: WorkflowState): Promise<WorkflowState> => {
    const url = state.data.url as string;
    const workspaceId = state.triggeredBy.workspaceId;

    const scan = await prisma.scan.findFirst({
      where: {
        url: { contains: url.replace(/^https?:\/\//, "").replace(/\/$/, "") },
        ...(workspaceId ? { workspaceId } : { userId: state.triggeredBy.userId }),
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        moderate: true,
        minor: true,
        createdAt: true,
      },
    });

    if (!scan) {
      return {
        ...state,
        data: { ...state.data, hasScan: false, message: `No completed scan found for ${url}. Run a scan first.` },
      };
    }

    return {
      ...state,
      data: {
        ...state.data,
        hasScan: true,
        scanId: scan.id,
        score: scan.score,
        totalViolations: scan.totalViolations,
        critical: scan.critical,
        serious: scan.serious,
        moderate: scan.moderate,
        minor: scan.minor,
        scanDate: scan.createdAt.toISOString().split("T")[0],
      },
    };
  },
  next: (state: WorkflowState): string | null => {
    if (!state.data.hasScan) return "summarize";
    return "evaluate";
  },
};

// ── Step: Evaluate Compliance ─────────────────────────────────────────────────

const evaluateCompliance = {
  id: "evaluate",
  name: "Evaluate Compliance",
  description: "Determine compliance level and decide next action",
  execute: async (state: WorkflowState): Promise<WorkflowState> => {
    const score = state.data.score as number;
    const critical = state.data.critical as number;

    let complianceLevel: "passing" | "at-risk" | "failing";
    if (score >= 90 && critical === 0) {
      complianceLevel = "passing";
    } else if (score >= 70) {
      complianceLevel = "at-risk";
    } else {
      complianceLevel = "failing";
    }

    return {
      ...state,
      data: { ...state.data, complianceLevel },
    };
  },
  next: (state: WorkflowState): string | null => {
    const level = state.data.complianceLevel as string;
    if (level === "passing") return "summarize";
    return "generate-plan";
  },
};

// ── Step: Generate Remediation Plan ───────────────────────────────────────────

const generatePlan = {
  id: "generate-plan",
  name: "Generate Remediation Plan",
  description: "Use AI to create a prioritized fix plan based on violations",
  execute: async (state: WorkflowState): Promise<WorkflowState> => {
    const modelId = getDefaultModelId();
    if (!modelId) {
      return { ...state, data: { ...state.data, plan: "AI unavailable — manual review required." } };
    }

    const scanId = state.data.scanId as string;

    // Fetch top violations for the plan
    const violations = await prisma.violation.findMany({
      where: { scanId },
      orderBy: [
        { impact: "asc" }, // critical first (alphabetical: critical < minor < moderate < serious)
      ],
      select: { ruleId: true, impact: true, description: true, help: true, wcagCriteria: true },
      take: 10,
    });

    const violationSummary = violations.map((v, i) =>
      `${i + 1}. [${v.impact}] ${v.ruleId}: ${v.description} (WCAG ${v.wcagCriteria ?? "N/A"})`,
    ).join("\n");

    const prompt = getPrompt("chat-system");
    const result = await complete({
      model: modelId,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: `Generate a prioritized remediation plan for this site. Score: ${state.data.score}/100, ${state.data.totalViolations} violations (${state.data.critical} critical, ${state.data.serious} serious).

Top violations:
${violationSummary}

Create a plan with:
1. Critical fixes (do immediately)
2. High-priority fixes (this sprint)
3. Medium-priority fixes (next sprint)
4. Quick wins (low effort, high impact)

For each fix, include: what to do, which WCAG criterion it addresses, estimated effort (hours).`,
        },
      ],
      temperature: 0.4,
      maxTokens: 1500,
      metadata: { feature: "workflow-remediation-plan", userId: state.triggeredBy.userId },
    });

    return {
      ...state,
      data: { ...state.data, plan: result?.content ?? "Plan generation failed." },
    };
  },
};

// ── Step: Summarize ───────────────────────────────────────────────────────────

const summarize = {
  id: "summarize",
  name: "Summarize Results",
  description: "Compile final workflow output",
  execute: async (state: WorkflowState): Promise<WorkflowState> => {
    const { url, hasScan, score, complianceLevel, plan, totalViolations, critical, serious, scanDate, message } = state.data;

    let summary: string;

    if (!hasScan) {
      summary = message as string;
    } else if (complianceLevel === "passing") {
      summary = `✅ ${url} is in good shape! Score: ${score}/100 (scanned ${scanDate}). ${totalViolations} minor issues found but no critical/serious violations. Consider generating a compliance certificate.`;
    } else {
      summary = `⚠️ ${url} needs attention. Score: ${score}/100 (${critical} critical, ${serious} serious violations). Compliance level: ${complianceLevel}.\n\n${plan ? `## Remediation Plan\n\n${plan}` : ""}`;
    }

    return { ...state, data: { ...state.data, summary } };
  },
};

// ── Workflow Definition ────────────────────────────────────────────────────────

export const complianceAuditWorkflow: WorkflowDefinition = {
  id: "compliance-audit",
  name: "Compliance Audit",
  description: "Full compliance audit: scan → evaluate → remediation plan",
  entryStep: "validate",
  maxDurationMs: 30_000,
  steps: [validateInput, fetchScanResults, evaluateCompliance, generatePlan, summarize],
};
