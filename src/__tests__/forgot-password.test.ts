import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  passwordReset: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  sendEmail: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: { user: mocks.user, passwordReset: mocks.passwordReset },
}));
vi.mock("@/lib/email/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/service")>()),
  sendEmail: mocks.sendEmail,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  rateLimitHeaders: vi.fn(() => ({})),
}));

import { POST, PUT } from "@/app/api/auth/forgot-password/route";

function request(method: "POST" | "PUT", body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/forgot-password", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("password reset development OTP delivery", () => {
  let terminal: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    terminal = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.user.findUnique.mockResolvedValue({ id: "existing-user" });
    mocks.user.update.mockResolvedValue({ id: "existing-user" });
    mocks.passwordReset.updateMany.mockResolvedValue({ count: 0 });
    mocks.passwordReset.create.mockResolvedValue({ id: "reset-1" });
    mocks.passwordReset.update.mockResolvedValue({ id: "reset-1", used: true });
    mocks.passwordReset.findMany.mockResolvedValue([]);
    mocks.sendEmail.mockResolvedValue({ success: false, error: "Email not configured" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["master@reglayer.dev", "admin@reglayer.dev"])(
    "delivers %s's code only to the terminal and accepts it for reset",
    async (email) => {
      const startedAt = Date.now();
      const response = await POST(request("POST", { email }));

      expect(response.status).toBe(200);
      expect(terminal).toHaveBeenCalledTimes(1);
      const output = String(terminal.mock.calls[0][0]);
      expect(output).toContain(email);
      const otp = output.match(/\b\d{6}\b/)?.[0];
      expect(otp).toBeDefined();
      const stored = mocks.passwordReset.create.mock.calls[0][0].data;
      expect(stored.email).toBe(email);
      expect(stored.otp).not.toBe(otp);
      expect(await bcrypt.compare(otp!, stored.otp)).toBe(true);
      expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(startedAt + 600_000);
      expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600_000);
      expect(mocks.passwordReset.updateMany).toHaveBeenCalledWith({
        where: { email, used: false },
        data: { used: true },
      });
      expect(mocks.sendEmail).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body).toEqual({ success: true, message: "If an account exists, an OTP has been sent." });
      expect(JSON.stringify(body)).not.toContain(otp);

      mocks.passwordReset.findMany.mockResolvedValue([{ id: "reset-1", otp: stored.otp }]);
      const newPassword = "LocalReset123!";
      const resetResponse = await PUT(request("PUT", { email, otp, newPassword }));

      expect(resetResponse.status).toBe(200);
      expect(mocks.passwordReset.findMany).toHaveBeenCalledWith({
        where: { email, used: false, expiresAt: { gt: expect.any(Date) } },
        select: { id: true, otp: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      expect(mocks.passwordReset.update).toHaveBeenCalledWith({
        where: { id: "reset-1" }, data: { used: true },
      });
      expect(mocks.user.update.mock.calls[0][0].where).toEqual({ email });
      const passwordHash = mocks.user.update.mock.calls[0][0].data.passwordHash;
      expect(passwordHash).not.toBe(newPassword);
      expect(await bcrypt.compare(newPassword, passwordHash)).toBe(true);
      expect(terminal).toHaveBeenCalledTimes(1);
      expect(output).not.toContain(newPassword);
    },
  );

  it.each([
    ["production", "master@reglayer.dev"],
    ["production", "admin@reglayer.dev"],
    ["test", "master@reglayer.dev"],
    ["test", "admin@reglayer.dev"],
    ["development", "other@reglayer.dev"],
    ["development", "master@other.example"],
    ["development", "admin+alias@reglayer.dev"],
  ])("does not log OTPs in %s for %s", async (environment, email) => {
    vi.stubEnv("NODE_ENV", environment);

    const response = await POST(request("POST", { email }));

    expect(response.status).toBe(200);
    expect(terminal).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: email }));
    expect(await response.json()).not.toHaveProperty("otp");
  });

  it("does not reveal codes or create reset records for nonexistent accounts", async () => {
    mocks.user.findUnique.mockResolvedValue(null);

    const response = await POST(request("POST", { email: "master@reglayer.dev" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: "If an account exists, an OTP has been sent." });
    expect(mocks.passwordReset.create).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(terminal).not.toHaveBeenCalled();
  });

  it("does not log a code if persistence fails", async () => {
    mocks.passwordReset.create.mockRejectedValue(new Error("Persistence unavailable"));

    const response = await POST(request("POST", { email: "admin@reglayer.dev" }));

    expect(response.status).toBe(500);
    expect(terminal).not.toHaveBeenCalled();
  });

  it("retains request rate limiting for development accounts", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });

    const response = await POST(request("POST", { email: "admin@reglayer.dev" }));

    expect(response.status).toBe(429);
    expect(mocks.passwordReset.create).not.toHaveBeenCalled();
    expect(terminal).not.toHaveBeenCalled();
  });

  it("rejects an incorrect code without changing the password", async () => {
    mocks.passwordReset.findMany.mockResolvedValue([
      { id: "reset-1", otp: await bcrypt.hash("123456", 4) },
    ]);

    const response = await PUT(request("PUT", {
      email: "admin@reglayer.dev", otp: "654321", newPassword: "LocalReset123!",
    }));

    expect(response.status).toBe(400);
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.passwordReset.update).not.toHaveBeenCalled();
    expect(terminal).not.toHaveBeenCalled();
  });

  it("rejects a reset with no unused, unexpired code", async () => {
    const response = await PUT(request("PUT", {
      email: "admin@reglayer.dev", otp: "123456", newPassword: "LocalReset123!",
    }));

    expect(response.status).toBe(400);
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(terminal).not.toHaveBeenCalled();
  });

  it("retains password strength validation", async () => {
    const response = await PUT(request("PUT", {
      email: "admin@reglayer.dev", otp: "123456", newPassword: "short",
    }));

    expect(response.status).toBe(400);
    expect(mocks.passwordReset.findMany).not.toHaveBeenCalled();
    expect(mocks.user.update).not.toHaveBeenCalled();
  });
});