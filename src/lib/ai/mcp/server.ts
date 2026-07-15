/**
 * RegLayer — MCP (Model Context Protocol) Server
 *
 * WHY:  MCP lets external AI clients (Claude Desktop, Cursor, VS Code Copilot)
 *       access RegLayer's data and tools directly. Instead of building a
 *       custom integration for each AI tool, we expose one standard protocol.
 *
 * WHAT IT EXPOSES:
 *   Resources — structured data that AI clients can read:
 *     - reglayer://scans       → recent scan results
 *     - reglayer://violations  → violations from a scan
 *     - reglayer://compliance  → overall compliance status
 *
 *   Tools — actions AI clients can trigger:
 *     - scan_website     → trigger a scan
 *     - explain_violation → get AI explanation
 *     - search_violations → semantic search
 *
 *   Prompts — pre-built prompt templates:
 *     - compliance_review → full compliance audit prompt
 *
 * HOW MCP WORKS:
 *   1. Client discovers server capabilities (list resources, tools, prompts)
 *   2. Client requests a resource or invokes a tool
 *   3. Server responds with structured data
 *   4. Client's LLM uses the data as context
 *
 * PROTOCOL: JSON-RPC 2.0 over HTTP (or stdio for local servers)
 * SPEC: https://modelcontextprotocol.io/
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { searchViolations } from "@/lib/ai/vector/search";

// ── MCP Types ─────────────────────────────────────────────────────────────────

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
}

// ── Resources ─────────────────────────────────────────────────────────────────

export async function listResources(): Promise<MCPResource[]> {
  return [
    {
      uri: "reglayer://scans",
      name: "Recent Scans",
      description: "Latest accessibility scan results with scores and violation counts",
      mimeType: "application/json",
    },
    {
      uri: "reglayer://compliance",
      name: "Compliance Status",
      description: "Overall compliance posture across all monitored sites",
      mimeType: "application/json",
    },
  ];
}

export async function readResource(uri: string): Promise<string> {
  if (uri === "reglayer://scans") {
    const scans = await prisma.scan.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, url: true, score: true, totalViolations: true,
        critical: true, serious: true, status: true, createdAt: true,
      },
    });
    return JSON.stringify({ scans }, null, 2);
  }

  if (uri === "reglayer://compliance") {
    const scans = await prisma.scan.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { score: true, totalViolations: true, critical: true, serious: true },
    });
    const avgScore = scans.length > 0
      ? scans.reduce((sum, s) => sum + (s.score ?? 0), 0) / scans.length
      : 0;
    return JSON.stringify({
      averageScore: Math.round(avgScore * 10) / 10,
      totalScans: scans.length,
      totalViolations: scans.reduce((sum, s) => sum + s.totalViolations, 0),
      criticalIssues: scans.reduce((sum, s) => sum + s.critical, 0),
    }, null, 2);
  }

  if (uri.startsWith("reglayer://scans/")) {
    const scanId = uri.replace("reglayer://scans/", "");
    const violations = await prisma.violation.findMany({
      where: { scanId },
      select: { ruleId: true, impact: true, description: true, help: true, wcagCriteria: true, status: true },
      take: 50,
    });
    return JSON.stringify({ scanId, violations, count: violations.length }, null, 2);
  }

  return JSON.stringify({ error: `Unknown resource: ${uri}` });
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export function listTools(): MCPTool[] {
  return [
    {
      name: "search_violations",
      description: "Semantic search across accessibility violations using natural language. Finds violations by meaning, not just keywords.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          limit: { type: "number", description: "Max results (default 5)" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_scan_details",
      description: "Get detailed violation list for a specific scan ID.",
      inputSchema: {
        type: "object",
        properties: {
          scanId: { type: "string", description: "The scan ID" },
        },
        required: ["scanId"],
      },
    },
    {
      name: "get_compliance_status",
      description: "Get overall compliance status with scores and violation counts.",
      inputSchema: { type: "object", properties: {} },
    },
  ];
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "search_violations": {
      const query = args.query as string;
      const limit = (args.limit as number) ?? 5;
      try {
        const results = await searchViolations(query, { limit });
        return JSON.stringify({ results, count: results.length });
      } catch {
        return JSON.stringify({ results: [], count: 0, note: "Vector search unavailable" });
      }
    }
    case "get_scan_details": {
      const scanId = args.scanId as string;
      return readResource(`reglayer://scans/${scanId}`);
    }
    case "get_compliance_status": {
      return readResource("reglayer://compliance");
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── Prompts ───────────────────────────────────────────────────────────────────

export function listPrompts(): MCPPrompt[] {
  return [
    {
      name: "compliance_review",
      description: "Generate a comprehensive compliance review for a site URL",
      arguments: [
        { name: "url", description: "The site URL to review", required: true },
      ],
    },
  ];
}

export function getPromptMessages(name: string, args: Record<string, string>): { role: string; content: string }[] {
  if (name === "compliance_review") {
    return [
      {
        role: "user",
        content: `Perform a comprehensive accessibility compliance review for ${args.url}. Include: WCAG 2.1 AA assessment, regulatory risk (EAA, ADA), top violations by severity, and a prioritized remediation plan.`,
      },
    ];
  }
  return [{ role: "user", content: `Unknown prompt: ${name}` }];
}
