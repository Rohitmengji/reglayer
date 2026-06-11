/**
 * RegLayer — Notification Dispatcher Tests
 *
 * WHY: Dispatcher is a critical path — must respect preferences and never throw.
 * WHAT: Tests notify() for preference filtering, email delivery, and error swallowing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/email/service", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/integrations/webhookDispatcher", () => ({
  dispatchWebhookEvent: vi.fn().mockResolvedValue(undefined),
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

import { prisma } from "@/lib/database/prisma";
import { sendEmail } from "@/lib/email/service";
import { notify } from "@/lib/notifications/dispatcher";

const mockPrisma = prisma as any;
const mockSendEmail = sendEmail as any;

describe("notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.notification.create.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue({ email: "user@example.com" });
  });

  it("creates a notification row", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

    await notify("user1", {
      type: "scanComplete",
      title: "Scan done",
      body: "Your scan completed",
    });

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user1",
        type: "scanComplete",
        title: "Scan done",
        body: "Your scan completed",
      }),
    });
  });

  it("sends email when preference allows and emailHtml provided", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      scanComplete: true,
      weeklyDigest: true,
      newViolations: true,
      complianceAlerts: true,
      teamActivity: false,
      scheduledReports: false,
    });
    mockSendEmail.mockResolvedValue({ success: true });

    await notify("user1", {
      type: "scanComplete",
      title: "Scan done",
      body: "Your scan completed",
      emailHtml: "<p>Done</p>",
      emailSubject: "Scan complete",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@example.com",
        subject: "Scan complete",
        html: "<p>Done</p>",
      })
    );
  });

  it("does NOT send email when preference is false", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      scanComplete: false, // opted out
      weeklyDigest: true,
      newViolations: true,
      complianceAlerts: true,
      teamActivity: false,
      scheduledReports: false,
    });

    await notify("user1", {
      type: "scanComplete",
      title: "Scan done",
      body: "Done",
      emailHtml: "<p>Done</p>",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does NOT send email when no emailHtml provided", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

    await notify("user1", {
      type: "scanComplete",
      title: "Scan done",
      body: "Done",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("never throws even if DB fails", async () => {
    mockPrisma.notification.create.mockRejectedValue(new Error("DB down"));

    // Should not throw
    await expect(
      notify("user1", {
        type: "scanComplete",
        title: "Scan done",
        body: "Done",
      })
    ).resolves.toBeUndefined();
  });

  it("maps scoreDegraded to complianceAlerts preference", async () => {
    mockPrisma.notificationPreference.findUnique.mockResolvedValue({
      scanComplete: true,
      weeklyDigest: true,
      newViolations: true,
      complianceAlerts: false, // opted out
      teamActivity: false,
      scheduledReports: false,
    });

    await notify("user1", {
      type: "scoreDegraded",
      title: "Score dropped",
      body: "Score went down",
      emailHtml: "<p>Alert</p>",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
