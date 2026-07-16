/**
 * RegLayer — AI Memory Service
 *
 * Persistent long-term memory for the AI assistant. Remembers user preferences,
 * team context, and organizational knowledge across conversations.
 *
 * ARCHITECTURE:
 *   - Memories are key-value pairs with scope (USER / WORKSPACE / SYSTEM)
 *   - Extracted from conversations automatically OR set explicitly by users/admins
 *   - Injected into LLM context as part of system prompt personalization
 *   - Confidence decays over time for inferred memories (not stated ones)
 *
 * EXAMPLES:
 *   USER scope:   "preferred_wcag_level" → "AA" (user said "we target AA")
 *   WORKSPACE:    "tech_stack" → "React, Next.js, TypeScript"
 *   SYSTEM:       "eaa_deadline" → "June 28, 2025"
 *
 * INSPIRED BY:
 *   - ChatGPT Memory (user preferences persist across chats)
 *   - Notion AI (workspace knowledge)
 *   - Glean (organizational memory)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryScope = "USER" | "WORKSPACE" | "SYSTEM";

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  scope: MemoryScope;
  confidence: number;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryContext {
  userId: string;
  workspaceId: string | null;
}

// ── Core Operations ───────────────────────────────────────────────────────────

/**
 * Store or update a memory entry.
 * Uses upsert on (userId, workspaceId, key) to prevent duplicates.
 */
export async function setMemory(
  ctx: MemoryContext,
  key: string,
  value: string,
  opts?: {
    scope?: MemoryScope;
    confidence?: number;
    source?: string;
    expiresAt?: Date;
  },
): Promise<MemoryEntry> {
  const scope = opts?.scope ?? "USER";
  const confidence = opts?.confidence ?? 1.0;
  const source = opts?.source ?? "user_stated";

  const result = await prisma.aiMemory.upsert({
    where: {
      userId_workspaceId_key: {
        userId: scope === "USER" ? ctx.userId : "",
        workspaceId: ctx.workspaceId ?? "",
        key,
      },
    },
    update: {
      value,
      confidence,
      source,
      expiresAt: opts?.expiresAt ?? null,
    },
    create: {
      scope,
      key,
      value,
      confidence,
      source,
      userId: scope === "USER" ? ctx.userId : null,
      workspaceId: scope !== "USER" ? ctx.workspaceId : null,
      expiresAt: opts?.expiresAt ?? null,
    },
  });

  return {
    id: result.id,
    key: result.key,
    value: result.value,
    scope: result.scope as MemoryScope,
    confidence: result.confidence,
    source: result.source,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

/**
 * Retrieve all relevant memories for a given context.
 * Returns USER + WORKSPACE + SYSTEM memories, excluding expired ones.
 */
export async function getMemories(ctx: MemoryContext): Promise<MemoryEntry[]> {
  const now = new Date();

  const memories = await prisma.aiMemory.findMany({
    where: {
      OR: [
        // User's personal memories
        { userId: ctx.userId, scope: "USER" },
        // Workspace shared memories
        ...(ctx.workspaceId
          ? [{ workspaceId: ctx.workspaceId, scope: "WORKSPACE" as const }]
          : []),
        // System-wide memories
        { scope: "SYSTEM" as const },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 50, // Cap to prevent context overflow
  });

  // Filter expired in-memory (simpler than complex Prisma OR nesting)
  return memories
    .filter((m) => !m.expiresAt || m.expiresAt > now)
    .map((m) => ({
      id: m.id,
      key: m.key,
      value: m.value,
      scope: m.scope as MemoryScope,
      confidence: m.confidence,
      source: m.source,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
}

/**
 * Delete a specific memory by key.
 */
export async function deleteMemory(ctx: MemoryContext, key: string): Promise<boolean> {
  try {
    await prisma.aiMemory.delete({
      where: {
        userId_workspaceId_key: {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId ?? "",
          key,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * List all memories for a user (for the settings/memory management UI).
 */
export async function listUserMemories(userId: string): Promise<MemoryEntry[]> {
  const memories = await prisma.aiMemory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return memories.map((m) => ({
    id: m.id,
    key: m.key,
    value: m.value,
    scope: m.scope as MemoryScope,
    confidence: m.confidence,
    source: m.source,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));
}

/**
 * Clear all memories for a user (privacy/GDPR).
 */
export async function clearAllMemories(userId: string): Promise<number> {
  const result = await prisma.aiMemory.deleteMany({
    where: { userId },
  });
  return result.count;
}

// ── Context Injection ─────────────────────────────────────────────────────────

/**
 * Format memories into a system prompt section for LLM injection.
 * This is what gets prepended to the chat context.
 */
export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const userMemories = memories.filter((m) => m.scope === "USER");
  const workspaceMemories = memories.filter((m) => m.scope === "WORKSPACE");
  const systemMemories = memories.filter((m) => m.scope === "SYSTEM");

  const sections: string[] = [];

  if (userMemories.length > 0) {
    sections.push(
      "## User Preferences\n" +
      userMemories.map((m) => `- ${m.key}: ${m.value}`).join("\n"),
    );
  }

  if (workspaceMemories.length > 0) {
    sections.push(
      "## Team Context\n" +
      workspaceMemories.map((m) => `- ${m.key}: ${m.value}`).join("\n"),
    );
  }

  if (systemMemories.length > 0) {
    sections.push(
      "## Important Facts\n" +
      systemMemories.map((m) => `- ${m.key}: ${m.value}`).join("\n"),
    );
  }

  return "## Personalization (remembered from previous conversations)\n\n" + sections.join("\n\n");
}

// ── Memory Extraction ─────────────────────────────────────────────────────────

/**
 * Pattern-based extraction of memorizable facts from user messages.
 * Runs on each user message to detect statements worth remembering.
 *
 * This is a lightweight heuristic approach (no LLM call needed).
 * For higher accuracy, an LLM-based extractor can be layered on top.
 */
const MEMORY_PATTERNS: { pattern: RegExp; key: string; extractor: (match: RegExpMatchArray) => string }[] = [
  {
    pattern: /(?:we|our team|our company|our org(?:anization)?)\s+(?:uses?|runs?|builds?\s+(?:with|on|using))\s+(.+?)(?:\.\s|$)/i,
    key: "tech_stack",
    extractor: (m) => m[1].trim().replace(/\.$/, ""),
  },
  {
    pattern: /(?:we|i)\s+(?:target|need|require|want|aim for)\s+(?:WCAG\s+)?(?:level\s+)?(A{1,3})\b/i,
    key: "preferred_wcag_level",
    extractor: (m) => m[1].toUpperCase(),
  },
  {
    pattern: /(?:our|my)\s+(?:site|app|platform|product)\s+is\s+(?:a |an )?(.+?)(?:\.\s|$)/i,
    key: "product_type",
    extractor: (m) => m[1].trim().replace(/\.$/, ""),
  },
  {
    pattern: /(?:we're|we are|i'm|i am)\s+(?:in|working in|focused on)\s+(?:the\s+)?(.*?)\s+(?:industry|sector|space|market)/i,
    key: "industry",
    extractor: (m) => m[1].trim(),
  },
  {
    pattern: /(?:our|the)\s+deadline\s+is\s+(.+?)(?:\.|$)/i,
    key: "compliance_deadline",
    extractor: (m) => m[1].trim(),
  },
];

/**
 * Extract potential memories from a user message.
 * Returns key-value pairs that should be stored.
 */
export function extractMemories(message: string): { key: string; value: string }[] {
  const extracted: { key: string; value: string }[] = [];

  for (const { pattern, key, extractor } of MEMORY_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const value = extractor(match);
      if (value.length >= 1 && value.length < 200) {
        extracted.push({ key, value });
      }
    }
  }

  return extracted;
}
