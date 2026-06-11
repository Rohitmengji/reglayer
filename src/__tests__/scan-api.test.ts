/**
 * RegLayer — Scan API Tests
 *
 * WHY: The scan endpoint is the core product feature — must handle all cases robustly.
 * WHAT: Tests POST /api/scan: URL validation, auth check, credit deduction, scan execution, response format.
 * HOW: Mocks scanner, Prisma, auth. Tests: invalid URL, no credits, successful scan, error handling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mock all external dependencies
vi.mock("server-only", () => ({}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({
  authOptions: {},
}));

vi.mock("@/lib/auth/api-key", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/services/scanService", () => ({
  performScan: vi.fn(),
}));

vi.mock("@/lib/telemetry/logger", () => ({
  logger: {
    withContext: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/credits/plan-context", () => ({
  getPlanContext: vi.fn(),
  getMonthlyScansCount: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
  RATE_LIMITS: { scan: { limit: 10, windowSec: 60 } },
  rateLimitHeaders: vi.fn(() => ({})),
}));

vi.mock("@/lib/validations/ssrf", () => ({
  validateScanUrl: vi.fn(() => null),
}));

import { getServerSession } from "next-auth";
import { performScan } from "@/services/scanService";
import { getPlanContext, getMonthlyScansCount } from "@/lib/credits/plan-context";
import { rateLimit } from "@/lib/rate-limit";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { authenticateRequest } from "@/lib/auth/api-key";
import { POST } from "@/app/api/scan/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

describe("POST /api/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated user via session
    vi.mocked(authenticateRequest).mockResolvedValue({
      ok: true,
      userEmail: "test@example.com",
      userId: "user1",
      workspaceId: "ws1",
      via: "session",
    });
    vi.mocked(rateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60000,
    });
    vi.mocked(getPlanContext).mockResolvedValue(null);
    vi.mocked(validateScanUrl).mockReturnValue(null);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Authentication required. Provide a Bearer API key or sign in." }, { status: 401 }),
    } as any);

    const req = makeRequest({ url: "https://example.com" });
    const res = await POST(req as any);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Authentication required");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(rateLimit).mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });

    const req = makeRequest({ url: "https://example.com" });
    const res = await POST(req as any);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many requests");
  });

  it("returns 400 for invalid URL", async () => {
    const req = makeRequest({ url: "not-a-url" });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request");
  });

  it("returns 400 for missing URL", async () => {
    const req = makeRequest({});
    const res = await POST(req as any);

    expect(res.status).toBe(400);
  });

  it("returns 400 for non-http URL", async () => {
    const req = makeRequest({ url: "ftp://example.com" });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
  });

  it("returns 400 for SSRF attempt (private IP)", async () => {
    vi.mocked(validateScanUrl).mockReturnValue("Scanning private/internal IP addresses is not allowed");

    const req = makeRequest({ url: "http://169.254.169.254/latest/meta-data/" });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private/internal");
  });

  it("returns 429 when scan limit reached", async () => {
    vi.mocked(getPlanContext).mockResolvedValue({
      userId: "user1",
      plan: "FREE",
      isMasterAdmin: false,
      workspaceRole: "MEMBER",
      effectiveScansPerMonth: 5,
      limits: { scansPerMonth: 5, scheduledScans: 1, teamMembers: 1, retentionDays: 30 },
    } as any);
    vi.mocked(getMonthlyScansCount).mockResolvedValue(5);

    const req = makeRequest({ url: "https://example.com" });
    const res = await POST(req as any);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.upgradeRequired).toBe(true);
  });

  it("returns 200 with scan result on success", async () => {
    vi.mocked(performScan).mockResolvedValue({
      scan: { id: "scan_1", url: "https://example.com", status: "completed", summary: { score: 85 } },
      compliance: { overallCompliance: 90 },
    } as any);

    const req = makeRequest({ url: "https://example.com" });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scan.id).toBe("scan_1");
    expect(performScan).toHaveBeenCalledWith({
      url: "https://example.com",
      options: undefined,
      userEmail: "test@example.com",
    });
  });

  it("passes scan options through", async () => {
    vi.mocked(performScan).mockResolvedValue({ scan: {}, compliance: {} } as any);

    const req = makeRequest({
      url: "https://example.com",
      options: { includeScreenshot: true, timeout: 15000 },
    });
    await POST(req as any);

    expect(performScan).toHaveBeenCalledWith({
      url: "https://example.com",
      options: { includeScreenshot: true, timeout: 15000 },
      userEmail: "test@example.com",
    });
  });

  it("returns 500 when scan service throws", async () => {
    vi.mocked(performScan).mockRejectedValue(new Error("Browser crashed"));

    const req = makeRequest({ url: "https://example.com" });
    const res = await POST(req as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe("Browser crashed");
  });

  it("skips plan limit for master admin", async () => {
    vi.mocked(getPlanContext).mockResolvedValue({
      userId: "admin1",
      plan: "FREE",
      isMasterAdmin: true,
      workspaceRole: "OWNER",
      effectiveScansPerMonth: -1,
      limits: { scansPerMonth: 5 },
    } as any);
    vi.mocked(performScan).mockResolvedValue({ scan: {}, compliance: {} } as any);

    const req = makeRequest({ url: "https://example.com" });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(getMonthlyScansCount).not.toHaveBeenCalled();
  });
});
