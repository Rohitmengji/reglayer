/**
 * RegLayer — API Key Authentication Tests
 *
 * WHY: The API key auth module is a security boundary — verify key validation, expiry, and fallback.
 * WHAT: Tests authenticateApiKey and authenticateRequest for valid/invalid/expired keys and session fallback.
 * HOW: Mocks Prisma and next-auth, exercises all code paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({
  authOptions: {},
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/database/prisma";
import { authenticateApiKey, authenticateRequest } from "@/lib/auth/api-key";

const mockPrisma = prisma as any;
const mockGetSession = getServerSession as any;

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/scan", {
    method: "POST",
    headers,
  });
}

describe("authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.apiKey.update.mockResolvedValue({});
  });

  it("returns no-key when no authorization header", async () => {
    const result = await authenticateApiKey(makeRequest());
    expect(result.status).toBe("no-key");
  });

  it("returns no-key when authorization is not Bearer format", async () => {
    const result = await authenticateApiKey(
      makeRequest({ authorization: "Basic abc123" })
    );
    expect(result.status).toBe("no-key");
  });

  it("returns invalid for short key", async () => {
    const result = await authenticateApiKey(
      makeRequest({ authorization: "Bearer short" })
    );
    expect(result.status).toBe("invalid");
  });

  it("returns invalid when key not found in DB", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    const result = await authenticateApiKey(
      makeRequest({ authorization: "Bearer rl_test_a_valid_length_key_here" })
    );
    expect(result.status).toBe("invalid");
  });

  it("returns ok with context for valid key", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: "key_1",
      userId: "user_1",
      workspaceId: "ws_1",
      user: { email: "dev@example.com" },
    });

    const result = await authenticateApiKey(
      makeRequest({ authorization: "Bearer rl_test_a_valid_length_key_here" })
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.context).toEqual({
        keyId: "key_1",
        userId: "user_1",
        workspaceId: "ws_1",
        userEmail: "dev@example.com",
      });
    }
  });

  it("fires and forgets lastUsedAt update", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: "key_1",
      userId: "user_1",
      workspaceId: "ws_1",
      user: { email: "dev@example.com" },
    });
    mockPrisma.apiKey.update.mockResolvedValue({});

    await authenticateApiKey(
      makeRequest({ authorization: "Bearer rl_test_a_valid_length_key_here" })
    );

    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key_1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("handles non-expiring keys (expiresAt null)", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: "key_2",
      userId: "user_2",
      workspaceId: "ws_2",
      user: { email: "ci@example.com" },
    });

    const result = await authenticateApiKey(
      makeRequest({ authorization: "Bearer rl_noexpire_key_that_lasts" })
    );

    expect(result.status).toBe("ok");
    // Verify the query includes OR condition for null expiresAt
    expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      })
    );
  });
});

describe("authenticateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.apiKey.update.mockResolvedValue({});
  });

  it("returns ok via key when valid API key provided", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue({
      id: "key_1",
      userId: "user_1",
      workspaceId: "ws_1",
      user: { email: "dev@example.com" },
    });

    const result = await authenticateRequest(
      makeRequest({ authorization: "Bearer rl_test_a_valid_length_key_here" })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.via).toBe("key");
      expect(result.userEmail).toBe("dev@example.com");
      expect(result.keyId).toBe("key_1");
    }
  });

  it("returns 403 for invalid key — never falls back to session", async () => {
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    // Even if session exists, invalid key must hard-reject
    mockGetSession.mockResolvedValue({ user: { email: "session@example.com" } });

    const result = await authenticateRequest(
      makeRequest({ authorization: "Bearer rl_bad_key_should_not_fallback" })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      expect(result.response.status).toBe(403);
      expect(body.error).toContain("Invalid");
    }
  });

  it("falls back to session when no key provided", async () => {
    mockGetSession.mockResolvedValue({ user: { email: "user@example.com" } });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user_sess",
      memberships: [{ workspaceId: "ws_sess" }],
    });

    const result = await authenticateRequest(makeRequest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.via).toBe("session");
      expect(result.userEmail).toBe("user@example.com");
      expect(result.userId).toBe("user_sess");
      expect(result.workspaceId).toBe("ws_sess");
    }
  });

  it("returns 401 when no key and no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await authenticateRequest(makeRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});
