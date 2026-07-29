/**
 * Tests for AI chat tool definitions.
 *
 * WHY THIS FILE EXISTS:
 *   All five chat tools were silently non-functional in production. They declared
 *   their Zod schema under `parameters`, but AI SDK v5+ reads `inputSchema`. Three
 *   separate guards failed to catch it:
 *
 *     1. TypeScript — the gateway typed `tools?: any`, disabling checking at exactly
 *        the boundary that mattered.
 *     2. Tests — nothing referenced createChatTools, so no test could fail.
 *     3. Runtime — a tool the SDK can't parse just isn't offered to the model, which
 *        then answers from general knowledge. Indistinguishable from "the model chose
 *        not to call a tool".
 *
 *   The contract test below is the cheap guard that was missing. It asserts the SHAPE
 *   the SDK requires, so a regression fails in CI instead of silently degrading the
 *   assistant into an unrelated chatbot.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockScanFindMany = vi.fn();
const mockScanFindFirst = vi.fn();
const mockViolationFindMany = vi.fn();

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    scan: {
      findMany: (...args: unknown[]) => mockScanFindMany(...args),
      findFirst: (...args: unknown[]) => mockScanFindFirst(...args),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    violation: {
      findMany: (...args: unknown[]) => mockViolationFindMany(...args),
    },
  },
}));

import { createChatTools, explainWcag } from "@/lib/ai/tools/definitions";

const CTX = { workspaceId: "ws_alpha", userId: "user_1" };

describe("AI chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Contract: the shape the AI SDK actually reads ─────────────────────────

  describe("SDK contract", () => {
    const tools = createChatTools(CTX);

    it("exposes the expected tool set", () => {
      expect(Object.keys(tools).sort()).toEqual(
        ["explainWcag", "getComplianceStatus", "getRecentScans", "getViolations", "triggerScan"],
      );
    });

    it.each(Object.entries(createChatTools(CTX)))(
      "%s declares inputSchema (NOT the pre-v5 `parameters` field)",
      (_name, tool) => {
        const t = tool as Record<string, unknown>;
        // This is the assertion that would have caught the production bug.
        expect(t.inputSchema).toBeDefined();
        expect(t.parameters).toBeUndefined();
        expect(typeof t.description).toBe("string");
        expect(typeof t.execute).toBe("function");
      },
    );
  });

  // ── Multi-tenant isolation ────────────────────────────────────────────────

  describe("workspace scoping", () => {
    it("getRecentScans filters by the caller's workspace", async () => {
      mockScanFindMany.mockResolvedValue([]);
      const tools = createChatTools(CTX);

      await tools.getRecentScans.execute!({ limit: 3 }, {} as never);

      expect(mockScanFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: "ws_alpha" }, take: 3 }),
      );
    });

    it("falls back to userId scoping when there is no workspace", async () => {
      mockScanFindMany.mockResolvedValue([]);
      const tools = createChatTools({ workspaceId: null, userId: "user_1" });

      await tools.getRecentScans.execute!({}, {} as never);

      expect(mockScanFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user_1" } }),
      );
    });

    it("getViolations refuses a scan the caller cannot access", async () => {
      // Simulates a scan belonging to another tenant: the ownership pre-check misses.
      mockScanFindFirst.mockResolvedValue(null);
      const tools = createChatTools(CTX);

      const result = await tools.getViolations.execute!(
        { scanId: "scan_from_other_tenant" }, {} as never,
      );

      expect(result).toContain("not found");
      expect(mockViolationFindMany).not.toHaveBeenCalled();
    });
  });

  // ── Execution ─────────────────────────────────────────────────────────────

  describe("execution", () => {
    it("getRecentScans returns serialised scan data", async () => {
      mockScanFindMany.mockResolvedValue([
        {
          id: "scan_1", url: "https://example.com", score: 82, totalViolations: 7,
          critical: 1, serious: 2, status: "COMPLETED", createdAt: new Date("2026-07-01"),
        },
      ]);

      const tools = createChatTools(CTX);
      const result = await tools.getRecentScans.execute!({}, {} as never) as string;

      expect(JSON.parse(result)).toMatchObject({
        total: 1,
        scans: [{ id: "scan_1", url: "https://example.com", score: 82, violations: 7 }],
      });
    });

    it("getRecentScans reports emptiness in words the model can use", async () => {
      mockScanFindMany.mockResolvedValue([]);
      const tools = createChatTools(CTX);

      const result = await tools.getRecentScans.execute!({}, {} as never);

      expect(result).toContain("No scans found");
    });

    it("surfaces DB errors as text instead of throwing into the stream", async () => {
      mockScanFindMany.mockRejectedValue(new Error("connection reset"));
      const tools = createChatTools(CTX);

      const result = await tools.getRecentScans.execute!({}, {} as never) as string;

      expect(result).toContain("Error fetching scans");
      expect(result).toContain("connection reset");
    });

    it("explainWcag resolves a known criterion", async () => {
      const result = await explainWcag.execute!({ criterion: "1.4.3" }, {} as never) as string;

      expect(result).toContain("Contrast (Minimum)");
      expect(result).toContain("AA");
    });

    it("explainWcag admits when a criterion is outside its reference", async () => {
      const result = await explainWcag.execute!({ criterion: "9.9.9" }, {} as never) as string;

      expect(result).toContain("not in my built-in reference");
    });
  });
});
