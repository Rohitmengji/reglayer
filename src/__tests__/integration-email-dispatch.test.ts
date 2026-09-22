import { beforeEach, describe, expect, it, vi } from "vitest";

// The Email (SMTP) integration delivers scan events through a workspace's OWN
// SMTP server. These tests mock nodemailer + prisma + crypto so they assert the
// dispatch logic (transport wiring, password decryption, recipient resolution,
// message formatting, error handling) without opening a real connection.
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  decryptToken: vi.fn((v: string | null) => (v ? `dec:${v}` : null)),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  verify: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { integration: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/crypto", () => ({
  decryptToken: mocks.decryptToken,
  encryptToken: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport, getTestMessageUrl: vi.fn(() => null) },
}));

import { dispatchToIntegrations } from "@/lib/integrations/dispatcher";

function emailIntegration(config: Record<string, unknown>, accessToken: string | null = "enc-pass") {
  return { id: "i1", provider: "email", enabled: true, webhookUrl: null, accessToken, config };
}

const SCAN_PAYLOAD = { url: "https://example.com", score: 88, violations: 3, critical: 1, reportUrl: "https://reglayer/report" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, verify: mocks.verify, close: mocks.close });
  mocks.sendMail.mockResolvedValue({ messageId: "msg-1" });
  mocks.decryptToken.mockImplementation((v: string | null) => (v ? `dec:${v}` : null));
});

describe("email integration dispatch", () => {
  it("sends a scan.completed report via the workspace SMTP server", async () => {
    mocks.findMany.mockResolvedValue([
      emailIntegration({ host: "smtp.co", port: "465", user: "bot@co", to: "team@co" }),
    ]);

    const results = await dispatchToIntegrations("ws1", "scan.completed", SCAN_PAYLOAD);

    // Transport built from config; secure inferred from port 465; password decrypted.
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.co",
        port: 465,
        secure: true,
        auth: { user: "bot@co", pass: "dec:enc-pass" },
      })
    );

    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.from).toBe("bot@co");
    expect(mail.to).toBe("team@co");
    expect(mail.subject).toContain("88%");
    expect(mail.html).toContain("example.com");
    expect(mocks.close).toHaveBeenCalled();
    expect(results).toEqual([{ provider: "email", success: true }]);
  });

  it("falls back to the SMTP username when no recipient is set, and uses port 587 (not secure)", async () => {
    mocks.findMany.mockResolvedValue([
      emailIntegration({ host: "smtp.co", port: "587", user: "bot@co" }),
    ]);

    await dispatchToIntegrations("ws1", "scan.completed", SCAN_PAYLOAD);

    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false })
    );
    expect(mocks.sendMail.mock.calls[0][0].to).toBe("bot@co");
  });

  it("formats scan.failed and compliance.dropped events", async () => {
    mocks.findMany.mockResolvedValue([emailIntegration({ host: "smtp.co", port: "587", user: "bot@co" })]);
    await dispatchToIntegrations("ws1", "scan.failed", { url: "https://x.com", error: "boom" });
    expect(mocks.sendMail.mock.calls[0][0].subject).toContain("Scan failed");
    expect(mocks.sendMail.mock.calls[0][0].html).toContain("boom");

    mocks.sendMail.mockClear();
    await dispatchToIntegrations("ws1", "compliance.dropped", { url: "https://x.com", previousScore: 92, currentScore: 71 });
    expect(mocks.sendMail.mock.calls[0][0].subject).toContain("Compliance dropped");
    expect(mocks.sendMail.mock.calls[0][0].html).toContain("71%");
  });

  it("reports a failure (not a throw) when the SMTP server rejects the message", async () => {
    mocks.findMany.mockResolvedValue([emailIntegration({ host: "smtp.co", port: "587", user: "bot@co" })]);
    mocks.sendMail.mockRejectedValue(new Error("535 auth failed"));

    const results = await dispatchToIntegrations("ws1", "scan.completed", SCAN_PAYLOAD);

    expect(results[0].provider).toBe("email");
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("535 auth failed");
    expect(mocks.close).toHaveBeenCalled();
  });

  it("does not attempt a connection when SMTP host/user are missing", async () => {
    mocks.findMany.mockResolvedValue([emailIntegration({ user: "bot@co" })]);

    const results = await dispatchToIntegrations("ws1", "scan.completed", SCAN_PAYLOAD);

    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(results[0].success).toBe(false);
    expect(results[0].error).toMatch(/host/i);
  });

  it("does not send when the encrypted SMTP password is absent", async () => {
    mocks.findMany.mockResolvedValue([emailIntegration({ host: "smtp.co", port: "587", user: "bot@co" }, null)]);

    const results = await dispatchToIntegrations("ws1", "scan.completed", SCAN_PAYLOAD);

    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(results[0].success).toBe(false);
    expect(results[0].error).toMatch(/password/i);
  });
});
