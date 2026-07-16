/**
 * RegLayer — Agent Marketplace
 *
 * Dynamic agent registry where users create, configure, and share agents.
 * Replaces the hardcoded agent definitions with a database-backed registry
 * that supports custom agents, versioning, and cost controls.
 *
 * AGENT LIFECYCLE:
 *   Create Blueprint → Configure (prompt, tools, model, limits) →
 *   Test → Publish to marketplace → Other workspaces install
 *
 * BUILT-IN AGENTS (isSystem: true):
 *   - compliance-auditor: WCAG compliance analysis
 *   - legal-analyst: regulation mapping (ADA, EAA, Section 508)
 *   - developer-guide: code fix suggestions
 *   - scan-planner: scan strategy and scheduling
 *   - report-writer: compliance report generation
 *
 * CUSTOM AGENTS (user-created):
 *   - "ecommerce-a11y": specialized for e-commerce checkout flows
 *   - "mobile-auditor": mobile app accessibility
 *   - "pdf-checker": document accessibility verification
 *
 * INSPIRED BY:
 *   - OpenAI GPTs (custom agents with instructions + tools)
 *   - CrewAI (role-based agents with specific expertise)
 *   - AutoGen (configurable agent definitions)
 *   - Anthropic's tool_use (agent capabilities via tools)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentBlueprint {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  version: number;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  tools: string[];
  permissions: string[];
  costLimitUsd: number | null;
  isPublic: boolean;
  isSystem: boolean;
  createdBy: string | null;
  workspaceId: string | null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createBlueprint(opts: {
  slug: string;
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  permissions?: string[];
  costLimitUsd?: number;
  isPublic?: boolean;
  createdBy: string;
  workspaceId: string;
}): Promise<AgentBlueprint> {
  const result = await prisma.agentBlueprint.create({
    data: {
      slug: opts.slug,
      name: opts.name,
      description: opts.description,
      category: opts.category,
      systemPrompt: opts.systemPrompt,
      model: opts.model ?? "gpt-4o-mini",
      temperature: opts.temperature ?? 0.4,
      maxTokens: opts.maxTokens ?? 2000,
      tools: opts.tools ?? [],
      permissions: opts.permissions ?? [],
      costLimitUsd: opts.costLimitUsd ?? null,
      isPublic: opts.isPublic ?? false,
      createdBy: opts.createdBy,
      workspaceId: opts.workspaceId,
    },
  });
  return mapBlueprint(result);
}

export async function getBlueprint(slug: string): Promise<AgentBlueprint | null> {
  const result = await prisma.agentBlueprint.findUnique({ where: { slug } });
  return result ? mapBlueprint(result) : null;
}

export async function listBlueprints(opts?: {
  workspaceId?: string;
  category?: string;
  publicOnly?: boolean;
  limit?: number;
}): Promise<AgentBlueprint[]> {
  const results = await prisma.agentBlueprint.findMany({
    where: {
      OR: [
        ...(opts?.workspaceId ? [{ workspaceId: opts.workspaceId }] : []),
        { isSystem: true },
        ...(opts?.publicOnly ? [{ isPublic: true }] : []),
      ],
      ...(opts?.category ? { category: opts.category } : {}),
    },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    take: opts?.limit ?? 50,
  });
  return results.map(mapBlueprint);
}

export async function updateBlueprint(
  slug: string,
  updates: Partial<Pick<AgentBlueprint, "name" | "description" | "systemPrompt" | "model" | "temperature" | "maxTokens" | "tools" | "permissions" | "costLimitUsd" | "isPublic">>,
): Promise<AgentBlueprint | null> {
  try {
    const result = await prisma.agentBlueprint.update({
      where: { slug },
      data: { ...updates, version: { increment: 1 } },
    });
    return mapBlueprint(result);
  } catch {
    return null;
  }
}

export async function deleteBlueprint(slug: string): Promise<boolean> {
  try {
    await prisma.agentBlueprint.deleteMany({
      where: { slug, isSystem: false }, // cannot delete system agents
    });
    return true;
  } catch {
    return false;
  }
}

// ── System Agent Seeding ──────────────────────────────────────────────────────

const SYSTEM_AGENTS: Omit<AgentBlueprint, "id" | "createdBy" | "workspaceId">[] = [
  {
    slug: "compliance-auditor",
    name: "Compliance Auditor",
    description: "Analyzes scan results against WCAG, ADA, EAA, and Section 508 requirements",
    category: "compliance",
    version: 1,
    systemPrompt: "You are a WCAG compliance auditor. Analyze accessibility scan results and identify which standards are violated. Always cite specific WCAG success criteria.",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 2000,
    tools: ["getRecentScans", "getViolations", "getComplianceStatus"],
    permissions: ["scans.read", "violations.read"],
    costLimitUsd: 0.05,
    isPublic: true,
    isSystem: true,
  },
  {
    slug: "legal-analyst",
    name: "Legal Analyst",
    description: "Maps violations to legal requirements and assesses litigation risk",
    category: "legal",
    version: 1,
    systemPrompt: "You are an accessibility law expert. Map technical violations to specific legal requirements (ADA Title III, EAA Directive 2019/882, Section 508, EN 301 549). Assess litigation risk.",
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 2000,
    tools: ["getViolations", "getComplianceStatus"],
    permissions: ["scans.read", "violations.read"],
    costLimitUsd: 0.05,
    isPublic: true,
    isSystem: true,
  },
  {
    slug: "developer-guide",
    name: "Developer Guide",
    description: "Generates code fixes with before/after examples for accessibility violations",
    category: "development",
    version: 1,
    systemPrompt: "You are a senior frontend developer specializing in accessible HTML, CSS, and ARIA. Provide concrete code fixes with before/after examples. Explain why each fix works.",
    model: "gpt-4o-mini",
    temperature: 0.4,
    maxTokens: 3000,
    tools: ["getViolations"],
    permissions: ["violations.read"],
    costLimitUsd: 0.05,
    isPublic: true,
    isSystem: true,
  },
  {
    slug: "report-writer",
    name: "Report Writer",
    description: "Generates executive compliance reports from scan data",
    category: "compliance",
    version: 1,
    systemPrompt: "You write executive-level accessibility compliance reports. Summarize scan results for non-technical stakeholders. Include risk assessment, trends, and recommended actions.",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 4000,
    tools: ["getRecentScans", "getViolations", "getComplianceStatus"],
    permissions: ["scans.read", "violations.read"],
    costLimitUsd: 0.10,
    isPublic: true,
    isSystem: true,
  },
  {
    slug: "scan-planner",
    name: "Scan Planner",
    description: "Recommends scan strategy, scheduling, and coverage based on site structure",
    category: "research",
    version: 1,
    systemPrompt: "You are a QA strategist for web accessibility. Analyze site structure and recommend which pages to scan, how often, and what to prioritize based on traffic and risk.",
    model: "gpt-4o-mini",
    temperature: 0.4,
    maxTokens: 2000,
    tools: ["getRecentScans"],
    permissions: ["scans.read", "sites.read"],
    costLimitUsd: 0.03,
    isPublic: true,
    isSystem: true,
  },
];

/**
 * Seed system agents into the database (idempotent).
 * Called during app initialization or migration.
 */
export async function seedSystemAgents(): Promise<number> {
  let seeded = 0;
  for (const agent of SYSTEM_AGENTS) {
    await prisma.agentBlueprint.upsert({
      where: { slug: agent.slug },
      update: {}, // don't overwrite customizations
      create: {
        ...agent,
        createdBy: null,
        workspaceId: null,
      },
    });
    seeded++;
  }
  return seeded;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapBlueprint(row: {
  id: string; slug: string; name: string; description: string;
  category: string; version: number; systemPrompt: string; model: string;
  temperature: number; maxTokens: number; tools: string[]; permissions: string[];
  costLimitUsd: number | null; isPublic: boolean; isSystem: boolean;
  createdBy: string | null; workspaceId: string | null;
}): AgentBlueprint {
  return {
    id: row.id, slug: row.slug, name: row.name, description: row.description,
    category: row.category, version: row.version, systemPrompt: row.systemPrompt,
    model: row.model, temperature: row.temperature, maxTokens: row.maxTokens,
    tools: row.tools, permissions: row.permissions, costLimitUsd: row.costLimitUsd,
    isPublic: row.isPublic, isSystem: row.isSystem, createdBy: row.createdBy,
    workspaceId: row.workspaceId,
  };
}
