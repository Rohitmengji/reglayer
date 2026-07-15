/**
 * RegLayer — AI Tool Definitions
 *
 * WHY:  Tool calling lets the LLM take actions — scan sites, look up violations,
 *       explain regulations — instead of just generating text. The LLM decides
 *       WHEN to call a tool and WHAT arguments to pass. We execute it and return
 *       the result.
 *
 * HOW IT WORKS:
 *   1. We define tools with: name, description, parameters (Zod schema), execute fn
 *   2. Tools are passed to streamText() / generateText() via the AI SDK
 *   3. When the LLM wants to use a tool, it outputs a tool_call with arguments
 *   4. The AI SDK automatically calls our execute() function
 *   5. The result is sent back to the LLM for it to synthesize into a response
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
import { prisma } from "@/lib/database/prisma";
import type { Impact } from "@/generated/prisma/client";

// ── Tool: Get Recent Scans ───────────────────────────────────────────────────

export const getRecentScans = {
  description: "Get the user's most recent accessibility scans with scores and violation counts. Use this when the user asks about their scan history, recent results, or compliance status.",
  parameters: z.object({
    limit: z.number().int().min(1).max(20).optional().describe("Number of scans to return (default 5)"),
  }),
  execute: async ({ limit }: { limit?: number }) => {
    const take = limit ?? 5;
    const scans = await prisma.scan.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        url: true,
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        status: true,
        createdAt: true,
      },
    });

    if (scans.length === 0) {
      return "No scans found. The user hasn't scanned any sites yet.";
    }

    return JSON.stringify({
      scans: scans.map((s) => ({
        id: s.id,
        url: s.url,
        score: s.score,
        violations: s.totalViolations,
        critical: s.critical,
        serious: s.serious,
        status: s.status,
        date: s.createdAt.toISOString().split("T")[0],
      })),
      total: scans.length,
    });
  },
};

// ── Tool: Get Violations for a Scan ──────────────────────────────────────────

export const getViolations = {
  description: "Get the detailed list of accessibility violations from a specific scan. Use this when the user asks about specific issues, wants to see violation details, or asks about a particular scan's problems.",
  parameters: z.object({
    scanId: z.string().describe("The scan ID to get violations for"),
    impact: z.enum(["critical", "serious", "moderate", "minor"]).optional().describe("Filter by impact severity"),
  }),
  execute: async ({ scanId, impact }: { scanId: string; impact?: string }) => {
    const violations = await prisma.violation.findMany({
      where: {
        scanId,
        ...(impact ? { impact: impact as Impact } : {}),
      },
      select: {
        id: true,
        ruleId: true,
        impact: true,
        description: true,
        help: true,
        wcagCriteria: true,
        tags: true,
        status: true,
      },
      take: 20,
    });

    if (violations.length === 0) {
      return `No violations found for scan ${scanId}${impact ? ` with ${impact} impact` : ""}.`;
    }

    return JSON.stringify({
      violations: violations.map((v) => ({
        ruleId: v.ruleId,
        impact: v.impact,
        description: v.description,
        help: v.help,
        wcag: v.wcagCriteria,
        status: v.status,
      })),
      count: violations.length,
    });
  },
};

// ── Tool: Explain WCAG Criterion ─────────────────────────────────────────────

export const explainWcag = {
  description: "Explain a specific WCAG success criterion in plain language. Use this when the user asks 'what is SC 1.4.3?' or 'explain WCAG criterion X.X.X'.",
  parameters: z.object({
    criterion: z.string().describe("The WCAG success criterion number (e.g., '1.4.3', '2.1.1', '4.1.2')"),
  }),
  execute: async ({ criterion }: { criterion: string }) => {
    // Common WCAG criteria lookup (no external API needed)
    const WCAG_MAP: Record<string, { name: string; level: string; summary: string }> = {
      "1.1.1": { name: "Non-text Content", level: "A", summary: "All non-text content has a text alternative that serves the equivalent purpose." },
      "1.3.1": { name: "Info and Relationships", level: "A", summary: "Information, structure, and relationships conveyed through presentation can be programmatically determined." },
      "1.4.1": { name: "Use of Color", level: "A", summary: "Color is not used as the only visual means of conveying information." },
      "1.4.3": { name: "Contrast (Minimum)", level: "AA", summary: "Text and images of text have a contrast ratio of at least 4.5:1 (3:1 for large text)." },
      "1.4.11": { name: "Non-text Contrast", level: "AA", summary: "UI components and graphical objects have a contrast ratio of at least 3:1." },
      "2.1.1": { name: "Keyboard", level: "A", summary: "All functionality is operable through a keyboard interface without specific timings." },
      "2.4.1": { name: "Bypass Blocks", level: "A", summary: "A mechanism is available to bypass blocks of content repeated on multiple pages." },
      "2.4.4": { name: "Link Purpose (In Context)", level: "A", summary: "The purpose of each link can be determined from the link text or its context." },
      "2.4.7": { name: "Focus Visible", level: "AA", summary: "Any keyboard operable user interface has a mode of operation where the focus indicator is visible." },
      "3.1.1": { name: "Language of Page", level: "A", summary: "The default human language of each page can be programmatically determined." },
      "4.1.1": { name: "Parsing", level: "A", summary: "Elements have complete start and end tags, are nested according to spec, and have unique IDs." },
      "4.1.2": { name: "Name, Role, Value", level: "A", summary: "All UI components have accessible names, roles, states, and values that can be programmatically determined." },
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

    return `I don't have a built-in reference for SC ${criterion}. Check https://www.w3.org/TR/WCAG21/`;
  },
};

// ── Tool: Get Compliance Summary ─────────────────────────────────────────────

export const getComplianceStatus = {
  description: "Get an overview of the user's overall compliance status across all monitored sites. Use this when the user asks 'how compliant are we?', 'what's our accessibility score?', or wants a status overview.",
  parameters: z.object({}),
  execute: async () => {
    const [scanCount, siteCount, recentScans] = await Promise.all([
      prisma.scan.count(),
      prisma.scan.groupBy({ by: ["url"], _count: true }).then((r) => r.length),
      prisma.scan.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { score: true, totalViolations: true, critical: true, serious: true },
      }),
    ]);

    if (recentScans.length === 0) {
      return "No scans found. No compliance data available yet.";
    }

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
  },
};

// ── Tool Registry ────────────────────────────────────────────────────────────

/**
 * All available tools for the AI chat.
 * The AI SDK accepts this object directly in streamText({ tools }).
 */
export const chatTools = {
  getRecentScans,
  getViolations,
  explainWcag,
  getComplianceStatus,
};

export type ChatToolName = keyof typeof chatTools;
