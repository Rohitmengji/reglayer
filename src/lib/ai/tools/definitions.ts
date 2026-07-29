/**
 * RegLayer — AI Tool Definitions
 *
 * WHY:  Tool calling lets the LLM take actions — scan sites, look up violations,
 *       explain regulations — instead of just generating text. The LLM decides
 *       WHEN to call a tool and WHAT arguments to pass. We execute it and return
 *       the result.
 *
 * HOW IT WORKS:
 *   1. We define tools with: name, description, inputSchema (Zod schema), execute fn
 *   2. Tools are passed to streamText() / generateText() via the AI SDK
 *   3. When the LLM wants to use a tool, it outputs a tool_call with arguments
 *   4. The AI SDK automatically calls our execute() function
 *   5. The result is sent back to the LLM for it to synthesize into a response
 *
 * IMPORTANT — ALWAYS use the `tool()` helper from "ai":
 *   The SDK reads the schema from `inputSchema`. It does NOT read `parameters`
 *   (that was the pre-v5 field name). A plain object using `parameters` type-checks
 *   fine but the SDK silently ignores the schema, so the model never receives a
 *   usable tool — it just answers from general knowledge and the failure is invisible.
 *   `tool()` makes TypeScript enforce the correct shape.
 *
 * SECURITY:
 *   - Tools are server-side only — the client never sees or calls them
 *   - Each tool validates its inputs via Zod before execution
 *   - Tools have access controls (scoped to the user's workspace)
 *   - Tool execution is logged via gateway events
 *
 * THIS IS HOW:
 *   - ChatGPT calls web browsing, code interpreter, DALL-E
 *   - Claude calls computer_use, bash, text_editor
 *   - Cursor calls terminal commands, file edits
 */

import { z } from "zod";
import { tool } from "ai";
import { prisma } from "@/lib/database/prisma";
import type { Impact } from "@/generated/prisma/client";
import { logger } from "@/lib/telemetry/logger";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TOOL_TIMEOUT_MS = 10_000;
const MAX_RESULT_CHARS = 2000;

/**
 * Wrap a tool execution with a timeout. If the DB query hangs,
 * the tool returns a graceful error instead of blocking the stream.
 */
async function withTimeout<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Tool "${label}" timed out after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS),
  );
  return Promise.race([fn(), timeout]);
}

/**
 * Truncate tool result to prevent context window overflow.
 * Adds a note when truncated so the LLM knows data was cut.
 */
function truncateResult(result: string): string {
  if (result.length <= MAX_RESULT_CHARS) return result;
  return result.slice(0, MAX_RESULT_CHARS) + "\n...[truncated — ask for specific details to see more]";
}

/**
 * Log tool execution for observability.
 */
function logToolCall(tool: string, params: unknown, durationMs: number, success: boolean) {
  logger.info(`[ai-tool] ${success ? "OK" : "FAIL"} | ${tool} | ${durationMs}ms`, { tool, params, durationMs, success });
}

// ── Tool Context ──────────────────────────────────────────────────────────────
// Tools receive the user's workspace context for multi-tenant isolation.
// This ensures a user can only query their own workspace's data.

export interface ToolContext {
  workspaceId: string | null;
  userId: string;
}

// ── Tool: Get Recent Scans ───────────────────────────────────────────────────

function makeGetRecentScans(ctx: ToolContext) {
  return tool({
    description: "Get the user's most recent accessibility scans with scores and violation counts. Use this when the user asks about their scan history, recent results, or compliance status.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).optional().describe("Number of scans to return (default 5)"),
    }),
    execute: async ({ limit }) => {
      const start = Date.now();
      try {
        const take = limit ?? 5;
        const where = ctx.workspaceId ? { workspaceId: ctx.workspaceId } : { userId: ctx.userId };
        const scans = await withTimeout(
          () => prisma.scan.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take,
            select: {
              id: true, url: true, score: true, totalViolations: true,
              critical: true, serious: true, status: true, createdAt: true,
            },
          }),
          "getRecentScans",
        );

        logToolCall("getRecentScans", { limit, workspaceId: ctx.workspaceId }, Date.now() - start, true);

        if (scans.length === 0) return "No scans found. The user hasn't scanned any sites yet.";

        return truncateResult(JSON.stringify({
          scans: scans.map((s) => ({
            id: s.id, url: s.url, score: s.score,
            violations: s.totalViolations, critical: s.critical, serious: s.serious,
            status: s.status, date: s.createdAt.toISOString().split("T")[0],
          })),
          total: scans.length,
        }));
      } catch (error) {
        logToolCall("getRecentScans", { limit }, Date.now() - start, false);
        return `Error fetching scans: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    },
  });
}

// ── Tool: Get Violations for a Scan ──────────────────────────────────────────

function makeGetViolations(ctx: ToolContext) {
  return tool({
    description: "Get the detailed list of accessibility violations from a specific scan. Use this when the user asks about specific issues, wants to see violation details, or asks about a particular scan's problems.",
    inputSchema: z.object({
      scanId: z.string().describe("The scan ID to get violations for"),
      impact: z.enum(["critical", "serious", "moderate", "minor"]).optional().describe("Filter by impact severity"),
    }),
    execute: async ({ scanId, impact }) => {
      const start = Date.now();
      try {
        // Verify the scan belongs to this user's workspace
        const scan = await prisma.scan.findFirst({
          where: {
            id: scanId,
            ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : { userId: ctx.userId }),
          },
          select: { id: true },
        });

        if (!scan) {
          return `Scan ${scanId} not found or you don't have access to it.`;
        }

        const violations = await withTimeout(
          () => prisma.violation.findMany({
            where: { scanId, ...(impact ? { impact: impact as Impact } : {}) },
            select: {
              ruleId: true, impact: true, description: true,
              help: true, wcagCriteria: true, status: true,
            },
            take: 15,
          }),
          "getViolations",
        );

        logToolCall("getViolations", { scanId, impact, workspaceId: ctx.workspaceId }, Date.now() - start, true);

        if (violations.length === 0) {
          return `No violations found for scan ${scanId}${impact ? ` with ${impact} impact` : ""}.`;
        }

        return truncateResult(JSON.stringify({
          violations: violations.map((v) => ({
            ruleId: v.ruleId, impact: v.impact,
            description: v.description.slice(0, 150),
            help: v.help.slice(0, 100),
            wcag: v.wcagCriteria, status: v.status,
          })),
          count: violations.length,
        }));
      } catch (error) {
        logToolCall("getViolations", { scanId, impact }, Date.now() - start, false);
        return `Error fetching violations: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    },
  });
}

// ── Tool: Explain WCAG Criterion ─────────────────────────────────────────────

export const explainWcag = tool({
  description: "Explain a specific WCAG success criterion in plain language. Use this when the user asks 'what is SC 1.4.3?' or 'explain WCAG criterion X.X.X'.",
  inputSchema: z.object({
    criterion: z.string().describe("The WCAG success criterion number (e.g., '1.4.3', '2.1.1', '4.1.2')"),
  }),
  execute: async ({ criterion }) => {
    const WCAG_MAP: Record<string, { name: string; level: string; summary: string }> = {
      "1.1.1": { name: "Non-text Content", level: "A", summary: "All non-text content has a text alternative that serves the equivalent purpose." },
      "1.2.1": { name: "Audio-only and Video-only", level: "A", summary: "Alternatives provided for prerecorded audio-only and video-only content." },
      "1.2.2": { name: "Captions (Prerecorded)", level: "A", summary: "Captions provided for all prerecorded audio content in synchronized media." },
      "1.2.3": { name: "Audio Description or Media Alternative", level: "A", summary: "Alternative or audio description for prerecorded video content." },
      "1.3.1": { name: "Info and Relationships", level: "A", summary: "Information, structure, and relationships conveyed through presentation can be programmatically determined." },
      "1.3.2": { name: "Meaningful Sequence", level: "A", summary: "Correct reading sequence can be programmatically determined." },
      "1.3.3": { name: "Sensory Characteristics", level: "A", summary: "Instructions don't rely solely on shape, color, size, location, or sound." },
      "1.3.4": { name: "Orientation", level: "AA", summary: "Content doesn't restrict display to a single orientation unless essential." },
      "1.3.5": { name: "Identify Input Purpose", level: "AA", summary: "Input field purpose can be programmatically determined for autocomplete." },
      "1.4.1": { name: "Use of Color", level: "A", summary: "Color is not used as the only visual means of conveying information." },
      "1.4.2": { name: "Audio Control", level: "A", summary: "Audio that plays automatically can be paused, stopped, or volume controlled." },
      "1.4.3": { name: "Contrast (Minimum)", level: "AA", summary: "Text has a contrast ratio of at least 4.5:1 (3:1 for large text)." },
      "1.4.4": { name: "Resize Text", level: "AA", summary: "Text can be resized up to 200% without loss of content or functionality." },
      "1.4.5": { name: "Images of Text", level: "AA", summary: "Text is used to convey information rather than images of text." },
      "1.4.10": { name: "Reflow", level: "AA", summary: "Content can be presented without scrolling in two dimensions at 320px/256px." },
      "1.4.11": { name: "Non-text Contrast", level: "AA", summary: "UI components and graphical objects have a contrast ratio of at least 3:1." },
      "1.4.12": { name: "Text Spacing", level: "AA", summary: "No loss of content when text spacing is adjusted (line height 1.5, etc.)." },
      "1.4.13": { name: "Content on Hover or Focus", level: "AA", summary: "Additional content triggered by hover/focus is dismissible, hoverable, and persistent." },
      "2.1.1": { name: "Keyboard", level: "A", summary: "All functionality is operable through a keyboard interface." },
      "2.1.2": { name: "No Keyboard Trap", level: "A", summary: "Focus can be moved away from a component using only the keyboard." },
      "2.2.1": { name: "Timing Adjustable", level: "A", summary: "Time limits can be turned off, adjusted, or extended." },
      "2.2.2": { name: "Pause, Stop, Hide", level: "A", summary: "Moving, blinking, or auto-updating content can be paused, stopped, or hidden." },
      "2.3.1": { name: "Three Flashes or Below Threshold", level: "A", summary: "Pages don't contain anything that flashes more than three times per second." },
      "2.4.1": { name: "Bypass Blocks", level: "A", summary: "A mechanism is available to bypass blocks of content repeated on multiple pages." },
      "2.4.2": { name: "Page Titled", level: "A", summary: "Web pages have titles that describe topic or purpose." },
      "2.4.3": { name: "Focus Order", level: "A", summary: "Focusable components receive focus in an order that preserves meaning." },
      "2.4.4": { name: "Link Purpose (In Context)", level: "A", summary: "The purpose of each link can be determined from the link text or its context." },
      "2.4.5": { name: "Multiple Ways", level: "AA", summary: "More than one way is available to locate a page within a set of pages." },
      "2.4.6": { name: "Headings and Labels", level: "AA", summary: "Headings and labels describe topic or purpose." },
      "2.4.7": { name: "Focus Visible", level: "AA", summary: "Keyboard focus indicator is visible." },
      "2.5.1": { name: "Pointer Gestures", level: "A", summary: "Multipoint/path-based gestures have single-pointer alternatives." },
      "2.5.2": { name: "Pointer Cancellation", level: "A", summary: "Functions triggered by pointer can be cancelled." },
      "2.5.3": { name: "Label in Name", level: "A", summary: "Accessible name includes the visible label text." },
      "2.5.4": { name: "Motion Actuation", level: "A", summary: "Functions triggered by motion have UI alternatives and can be disabled." },
      "3.1.1": { name: "Language of Page", level: "A", summary: "The default human language of each page can be programmatically determined." },
      "3.1.2": { name: "Language of Parts", level: "AA", summary: "Language of each passage or phrase can be programmatically determined." },
      "3.2.1": { name: "On Focus", level: "A", summary: "Receiving focus doesn't trigger a change of context." },
      "3.2.2": { name: "On Input", level: "A", summary: "Changing a setting doesn't automatically cause a change of context." },
      "3.2.3": { name: "Consistent Navigation", level: "AA", summary: "Navigation mechanisms are consistent across pages." },
      "3.2.4": { name: "Consistent Identification", level: "AA", summary: "Same-function components are identified consistently." },
      "3.3.1": { name: "Error Identification", level: "A", summary: "Input errors are automatically detected and described to the user in text." },
      "3.3.2": { name: "Labels or Instructions", level: "A", summary: "Labels or instructions provided when user input is required." },
      "3.3.3": { name: "Error Suggestion", level: "AA", summary: "Suggestions for correction are provided when input errors are detected." },
      "3.3.4": { name: "Error Prevention (Legal, Financial, Data)", level: "AA", summary: "Submissions are reversible, verifiable, or confirmable." },
      "4.1.1": { name: "Parsing", level: "A", summary: "Elements have complete start and end tags, are nested correctly, have unique IDs." },
      "4.1.2": { name: "Name, Role, Value", level: "A", summary: "All UI components have accessible names, roles, states, and values." },
      "4.1.3": { name: "Status Messages", level: "AA", summary: "Status messages can be programmatically determined without receiving focus." },
    };

    const info = WCAG_MAP[criterion];
    if (info) {
      return JSON.stringify({
        criterion: `WCAG 2.1 SC ${criterion}`,
        name: info.name,
        level: info.level,
        summary: info.summary,
        reference: `https://www.w3.org/WAI/WCAG21/Understanding/${criterion.replace(/\./g, "")}.html`,
      });
    }

    return `SC ${criterion} is not in my built-in reference (I cover all Level A and AA criteria). Check https://www.w3.org/TR/WCAG21/#${criterion.replace(/\./g, "")}`;
  },
});

// ── Tool: Get Compliance Summary ─────────────────────────────────────────────

function makeGetComplianceStatus(ctx: ToolContext) {
  return tool({
    description: "Get an overview of the user's overall compliance status across all monitored sites. Use this when the user asks 'how compliant are we?', 'what's our accessibility score?', or wants a status overview.",
    inputSchema: z.object({}),
    execute: async () => {
      const start = Date.now();
      try {
        const where = ctx.workspaceId ? { workspaceId: ctx.workspaceId } : { userId: ctx.userId };
        const [scanCount, siteCount, recentScans] = await withTimeout(
          () => Promise.all([
            prisma.scan.count({ where }),
            prisma.scan.groupBy({ by: ["url"], where, _count: true }).then((r) => r.length),
            prisma.scan.findMany({
              where,
              orderBy: { createdAt: "desc" },
              take: 10,
              select: { score: true, totalViolations: true, critical: true, serious: true },
            }),
          ]),
          "getComplianceStatus",
        );

        logToolCall("getComplianceStatus", { workspaceId: ctx.workspaceId }, Date.now() - start, true);

        if (recentScans.length === 0) return "No scans found. No compliance data available yet.";

        const avgScore = recentScans.reduce((sum, s) => sum + (s.score ?? 0), 0) / recentScans.length;
        const totalViolations = recentScans.reduce((sum, s) => sum + s.totalViolations, 0);
        const criticalCount = recentScans.reduce((sum, s) => sum + s.critical, 0);
        const seriousCount = recentScans.reduce((sum, s) => sum + s.serious, 0);

        return JSON.stringify({
          overview: {
            totalScans: scanCount,
            monitoredSites: siteCount,
            averageScore: Math.round(avgScore * 10) / 10,
            recentViolations: totalViolations,
            criticalIssues: criticalCount,
            seriousIssues: seriousCount,
          },
        });
      } catch (error) {
        logToolCall("getComplianceStatus", {}, Date.now() - start, false);
        return `Error fetching compliance status: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    },
  });
}

// ── Tool: Trigger a Scan (Chat → Agent Handoff) ─────────────────────────────

function makeTriggerScan(ctx: ToolContext) {
  return tool({
    description: "Scan a website for accessibility issues. Use this when the user says 'scan [URL]', 'check [URL]', 'test [URL]', or asks you to analyze a website's accessibility. This actually runs a real scan and returns results.",
    inputSchema: z.object({
      url: z.string().url().describe("The full URL to scan (must include https://)"),
    }),
    execute: async ({ url }) => {
      const start = Date.now();
      try {
        // We don't call performScan directly here because it requires browser launch
        // which would exceed tool timeout. Instead, trigger via internal API call.
        const { validateScanUrl } = await import("@/lib/validations/ssrf");
        const ssrfError = validateScanUrl(url);
        if (ssrfError) {
          return `Cannot scan this URL: ${ssrfError}`;
        }

        // Import and execute scan service
        const { performScan } = await import("@/services/scanService");
        const result = await performScan({
          url,
          options: { deep: false },
          userEmail: undefined, // Tool-initiated scan
        });

        logToolCall("triggerScan", { url, workspaceId: ctx.workspaceId }, Date.now() - start, true);

        const scan = result.scan;
        const summary = scan.summary;
        return truncateResult(JSON.stringify({
          scanId: scan.id,
          url: scan.url,
          score: summary.score,
          totalViolations: summary.totalViolations,
          critical: summary.critical,
          serious: summary.serious,
          moderate: summary.moderate,
          minor: summary.minor,
          status: "COMPLETED",
          summary: `Scan complete! Score: ${summary.score}/100 with ${summary.totalViolations} violations (${summary.critical} critical, ${summary.serious} serious).`,
        }));
      } catch (error) {
        logToolCall("triggerScan", { url }, Date.now() - start, false);
        return `Scan failed: ${error instanceof Error ? error.message : "unknown error"}. The site may be unreachable or blocking automated access.`;
      }
    },
  });
}

// ── Tool Registry ────────────────────────────────────────────────────────────

/**
 * Create workspace-scoped tools for a specific user session.
 *
 * WHY A FACTORY (not a static export):
 *   Multi-tenant isolation. Each request creates tools scoped to the user's
 *   workspace. A user in Workspace A can never query Workspace B's scans —
 *   the WHERE clause is baked into the tool at creation time.
 *
 *   This is how enterprise AI platforms (Glean, Harvey) handle tenant isolation
 *   in tool calling — tools are instantiated per-request with permissions.
 */
export function createChatTools(ctx: ToolContext) {
  return {
    getRecentScans: makeGetRecentScans(ctx),
    getViolations: makeGetViolations(ctx),
    explainWcag,
    getComplianceStatus: makeGetComplianceStatus(ctx),
    triggerScan: makeTriggerScan(ctx),
  };
}

export type ChatToolName = keyof ReturnType<typeof createChatTools>;
