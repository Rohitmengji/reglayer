/**
 * RegLayer — Monitors API SSRF regression tests
 *
 * WHY: POST /api/monitors creates a recurring Schedule the cron runner fetches
 *      server-side, so — like /api/schedules — it must reject internal/private
 *      destinations. This pins that guard (it was missing originally) and proves
 *      a safe public URL still creates the monitor + schedule.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    site: { findFirst: vi.fn(), create: vi.fn() },
    schedule: { create: vi.fn() },
    monitor: { create: vi.fn() },
  },
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
import { POST } from "@/app/api/monitors/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

const validBody = {
  name: "Prod alert",
  url: "https://example.com",
  condition: "score_below",
  threshold: 80,
};

describe("POST /api/monitors — SSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "test@example.com" } } as any);
    vi.mocked(validateScanUrl).mockReturnValue(null);
    vi.mocked(resolvesToInternalIp).mockResolvedValue(false);
    vi.mocked(prisma.site.findFirst).mockResolvedValue(null as any);
    vi.mocked(prisma.site.create).mockResolvedValue({ id: "site_1", url: "https://example.com" } as any);
    vi.mocked(prisma.schedule.create).mockResolvedValue({ id: "sch_1" } as any);
    vi.mocked(prisma.monitor.create).mockResolvedValue({ id: "mon_1" } as any);
  });

  it("rejects a literal internal IP with 400 and creates no schedule/monitor", async () => {
    vi.mocked(validateScanUrl).mockReturnValue("Scanning private/internal IP addresses is not allowed");

    const res = await POST(makeRequest({ ...validBody, url: "http://169.254.169.254/latest/meta-data/" }) as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private/internal");
    expect(prisma.schedule.create).not.toHaveBeenCalled();
    expect(prisma.monitor.create).not.toHaveBeenCalled();
  });

  it("rejects a public hostname that resolves to an internal IP with 400", async () => {
    vi.mocked(resolvesToInternalIp).mockResolvedValue(true);

    const res = await POST(makeRequest({ ...validBody, url: "http://intranet.example.com/" }) as any);

    expect(res.status).toBe(400);
    expect(prisma.schedule.create).not.toHaveBeenCalled();
  });

  it("allows a safe public URL and creates the schedule at a deliverable daily cadence", async () => {
    const res = await POST(makeRequest(validBody) as any);

    expect(res.status).toBe(201);
    expect(prisma.schedule.create).toHaveBeenCalledTimes(1);
    // Must NOT advertise a sub-daily cadence the daily cron runner can't honor.
    const cron = vi.mocked(prisma.schedule.create).mock.calls[0][0].data.cron;
    expect(cron).toBe("0 9 * * *");
  });
});
