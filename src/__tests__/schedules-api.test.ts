/**
 * RegLayer — Schedules API SSRF regression tests
 *
 * WHY: Scheduled scans are fetched server-side by the cron runner, so the create
 *      endpoint MUST reject internal/private destinations — exactly like every
 *      other scan-initiating endpoint. This pins that guard so it can't silently
 *      regress (it was missing originally), and proves legit public URLs still pass.
 * HOW: Mocks auth, prisma, the schedule service, and the SSRF helper (the helper's
 *      own logic is covered by ssrf.test.ts); asserts the wiring at the route layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));

vi.mock("@/lib/scheduling/scheduleService", () => ({
  createScheduleInDB: vi.fn(),
  toggleScheduleInDB: vi.fn(),
  deleteScheduleFromDB: vi.fn(),
  listSchedulesForWorkspace: vi.fn(),
  validateCronForPlan: vi.fn(() => null),
}));

vi.mock("@/lib/database/workspace", () => ({
  getOrCreateWorkspace: vi.fn(async () => "w"),
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    workspaceMember: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    schedule: { count: vi.fn() },
    scan: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/credits/plan-limits", () => ({
  PLAN_LIMITS: {
    ENTERPRISE: { features: { scheduledScans: true } },
    PRO: { features: { scheduledScans: true } },
    FREE: { features: { scheduledScans: false } },
  },
}));

vi.mock("@/lib/telemetry/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireWorkspacePermission: vi.fn(async () => ({
    ok: true,
    ctx: { workspaceId: "w", userId: "u", email: "test@example.com", isMasterAdmin: false, workspaceRole: "OWNER" },
  })),
}));

vi.mock("@/lib/validations/ssrf", () => ({
  validateScanUrl: vi.fn(() => null),
  resolvesToInternalIp: vi.fn(async () => false),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/database/prisma";
import { validateScanUrl, resolvesToInternalIp } from "@/lib/validations/ssrf";
import { createScheduleInDB } from "@/lib/scheduling/scheduleService";
import { POST } from "@/app/api/schedules/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

describe("POST /api/schedules — SSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "test@example.com" } } as any);
    // master admin so the plan-feature gate is bypassed; we're exercising SSRF, not gating
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u", email: "test@example.com", isMasterAdmin: true, plan: "ENTERPRISE" } as any);
    vi.mocked(prisma.workspaceMember.findFirst).mockResolvedValue({ workspace: { plan: "ENTERPRISE" } } as any);
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ plan: "ENTERPRISE" } as any);
    vi.mocked(prisma.schedule.count).mockResolvedValue(0 as any);
    vi.mocked(validateScanUrl).mockReturnValue(null);
    vi.mocked(resolvesToInternalIp).mockResolvedValue(false);
    vi.mocked(createScheduleInDB).mockResolvedValue({
      id: "sch_1",
      name: "Prod",
      cron: "0 9 * * *",
      enabled: true,
      workspaceId: "w",
      site: { url: "https://example.com", name: "example.com" },
    } as any);
  });

  it("rejects a literal internal IP (cloud metadata) with 400 and never creates a schedule", async () => {
    vi.mocked(validateScanUrl).mockReturnValue("Scanning private/internal IP addresses is not allowed");

    const res = await POST(makeRequest({ name: "Prod", url: "http://169.254.169.254/latest/meta-data/", cron: "0 9 * * *" }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private/internal");
    expect(createScheduleInDB).not.toHaveBeenCalled();
  });

  it("rejects a public hostname that resolves to an internal IP with 400", async () => {
    vi.mocked(validateScanUrl).mockReturnValue(null);
    vi.mocked(resolvesToInternalIp).mockResolvedValue(true);

    const res = await POST(makeRequest({ name: "Prod", url: "http://intranet.example.com/", cron: "0 9 * * *" }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private/internal");
    expect(createScheduleInDB).not.toHaveBeenCalled();
  });

  it("allows a safe public URL and flattens the monitored url onto the response", async () => {
    const res = await POST(makeRequest({ name: "Prod", url: "https://example.com", cron: "0 9 * * *" }) as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.schedule.url).toBe("https://example.com");
    expect(createScheduleInDB).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com", workspaceId: "w" }));
  });
});
