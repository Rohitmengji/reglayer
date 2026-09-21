import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), limit: vi.fn(), consume: vi.fn(), refund: vi.fn(),
  explain: vi.fn(), summarize: vi.fn(), available: vi.fn(), model: vi.fn(), log: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit, RATE_LIMITS: { ai: {} }, rateLimitHeaders: () => ({}) }));
vi.mock("@/lib/credits", () => ({ consumeCredits: mocks.consume, refundCredits: mocks.refund }));
vi.mock("@/lib/ai/gateway", () => ({ isAIAvailable: mocks.available, getDefaultModelId: mocks.model }));
vi.mock("@/lib/ai/explainers/violationExplainer", () => ({ explainViolation: mocks.explain }));
vi.mock("@/lib/ai/summaries/complianceSummary", () => ({ generateComplianceSummary: mocks.summarize }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { error: mocks.log } }));

import { POST } from "@/app/api/ai/explain/route";

const violation = { id: "image-alt", impact: "critical", description: "Image has no alternative text", help: "Provide alternative text", helpUrl: "https://example.test/help", wcagTags: ["wcag2a"], nodes: [{ html: "<img src='logo.png'>", target: ["img"], failureSummary: "Missing alt" }] };
const validBody = { type: "violation", violation };
const summaryBody = {
  type: "summary", scan: {
    id: "scan-1", url: "https://example.test", timestamp: "2026-09-21T00:00:00Z", status: "completed",
    summary: { score: 80, totalViolations: 1, critical: 1, serious: 0, moderate: 0, minor: 0 },
    violations: [violation], metadata: { pageTitle: "Example", scanDuration: 1000, browserEngine: "chromium", axeCoreVersion: "4.11" },
  }, compliance: { scanId: "scan-1", timestamp: "2026-09-21T00:00:00Z", overallCompliance: 80, ruleResults: [] },
};
const request = (body: unknown, raw = false) => new NextRequest("http://localhost/api/ai/explain", { method: "POST", body: raw ? String(body) : JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
  mocks.session.mockResolvedValue({ user: { email: "audit@example.test" } });
  mocks.user.mockResolvedValue({ id: "user-1", isMasterAdmin: false });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.available.mockReturnValue(true);
  mocks.model.mockReturnValue("configured-model");
  mocks.consume.mockResolvedValue({ success: true, cost: 1, creditsUsed: 1, creditsRemaining: 24 });
  mocks.refund.mockResolvedValue(undefined);
  mocks.explain.mockResolvedValue({ explanation: "Review the purpose of the image", remediation: "Add appropriate alternative text" });
  mocks.summarize.mockResolvedValue({ overview: "Automated findings require review" });
});
afterEach(() => vi.unstubAllEnvs());

describe("AI explanation credit contract", () => {
  it.each([null, {}, { type: "violation" }, { type: "summary", scan: {}, compliance: {} }, { type: "violation", violation: { ...violation, nodes: "invalid" } }])("rejects invalid input before charging: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.explain).not.toHaveBeenCalled();
    expect(mocks.summarize).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without charging", async () => {
    expect((await POST(request("{bad", true))).status).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("does not charge when no provider is available", async () => {
    mocks.available.mockReturnValue(false);
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await POST(request(validBody))).status).toBe(503);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("uses configured gateway availability rather than requiring OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect((await POST(request(validBody))).status).toBe(200);
    expect(mocks.explain).toHaveBeenCalled();
  });

  it.each(["null", "throw"])("refunds a failed explanation (%s) and never calls it successful", async (outcome) => {
    if (outcome === "null") mocks.explain.mockResolvedValue(null);
    else mocks.explain.mockRejectedValue(new Error("provider failed"));
    expect((await POST(request(validBody))).status).toBe(502);
    expect(mocks.refund).toHaveBeenCalledTimes(1);
    expect(mocks.refund).toHaveBeenCalledWith("user-1", "explanation", { isMasterAdmin: false });
  });

  it("refunds an unavailable summary", async () => {
    mocks.summarize.mockResolvedValue(null);
    expect((await POST(request(summaryBody))).status).toBe(502);
    expect(mocks.refund).toHaveBeenCalledTimes(1);
  });

  it("does not refund a successful response", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect((await response.json()).explanation).toBeTruthy();
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("does not invoke the provider when credits are denied", async () => {
    mocks.consume.mockResolvedValue({ success: false, cost: 1, creditsRemaining: 0 });
    expect((await POST(request(validBody))).status).toBe(429);
    expect(mocks.explain).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("reports refund failure without leaking internal errors or claiming restoration", async () => {
    mocks.explain.mockResolvedValue(null);
    mocks.refund.mockRejectedValue(new Error("database connection private details"));
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("CREDIT_REFUND_FAILED");
    expect(JSON.stringify(body)).not.toContain("private details");
    expect(mocks.log).toHaveBeenCalled();
  });
});