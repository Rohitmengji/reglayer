/**
 * RegLayer — Invitation sign-in credential flow
 *
 * Covers: issuing a temporary password for an invited member, delivering it by
 * email, signing in with it, and being forced to choose a real password before
 * the product can be used.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  member: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
  reset: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  session: vi.fn(),
  cookie: vi.fn(),
  emailConfigured: vi.fn(),
  sendInvite: vi.fn(),
  sendPasswordSet: vi.fn(),
  token: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.token }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/database/prisma", () => ({ prisma: { user: mocks.user, workspaceMember: mocks.member, passwordReset: mocks.reset } }));
vi.mock("@/lib/email/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/service")>()),
  isEmailConfigured: mocks.emailConfigured,
  sendTeamInviteEmail: mocks.sendInvite,
  sendPasswordSetEmail: mocks.sendPasswordSet,
}));
vi.mock("@/lib/rate-limit-middleware", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ success: true }),
  rateLimitSync: () => ({ success: true }),
  rateLimitHeaders: () => ({}),
  RATE_LIMITS: { api: { limit: 120, windowSec: 60 } },
}));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { withContext: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) } }));

import { buildTeamInviteEmail, buildPasswordSetEmail } from "@/lib/email/service";
import {
  INVITE_CREDENTIAL_PREFIX,
  issueInviteCredential,
  verifyInviteCredential,
} from "@/lib/auth/invite-credential";
import { POST as invite } from "@/app/api/team/route";
import { POST as setPassword } from "@/app/api/account/set-password/route";
import { proxy } from "@/proxy";

const INVITEE = "invitee@example.test";
const request = (body: unknown, url = "http://localhost/api/team") =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.session.mockResolvedValue({ user: { email: "owner@example.test" } });
  mocks.cookie.mockReturnValue({ value: "workspace-a" });
  mocks.user.findUnique.mockImplementation(async ({ where }) =>
    where.email === "owner@example.test"
      ? {
          id: "owner", email: "owner@example.test", name: "Owner", isMasterAdmin: false,
          memberships: [{ id: "owner-membership", workspaceId: "workspace-a", role: "OWNER", workspace: { id: "workspace-a", name: "Alpha", plan: "ENTERPRISE" } }],
        }
      : null,
  );
  mocks.user.create.mockImplementation(async ({ data }) => ({ id: "invited-user", ...data }));
  mocks.user.update.mockResolvedValue({ id: "invited-user" });
  mocks.member.findUnique.mockResolvedValue(null);
  mocks.member.count.mockResolvedValue(1);
  mocks.member.create.mockResolvedValue({ id: "membership", role: "MEMBER", joinedAt: new Date(), user: { id: "invited-user", name: "invitee", email: INVITEE } });
  mocks.reset.updateMany.mockResolvedValue({ count: 0 });
  mocks.reset.create.mockImplementation(async ({ data }) => ({ id: "credential", ...data }));
  mocks.reset.update.mockResolvedValue({ id: "credential" });
  mocks.reset.findMany.mockResolvedValue([]);
  mocks.reset.count.mockResolvedValue(0);
  mocks.emailConfigured.mockReturnValue(true);
  mocks.sendInvite.mockResolvedValue({ success: true });
  mocks.sendPasswordSet.mockResolvedValue({ success: true });
});

describe("invitation credential", () => {
  it("stores a hashed, expiring credential and retires earlier invitations", async () => {
    const startedAt = Date.now();
    const issued = await issueInviteCredential(INVITEE);

    const stored = mocks.reset.create.mock.calls[0][0].data;
    expect(stored.email).toBe(INVITEE);
    expect(stored.otp.startsWith(INVITE_CREDENTIAL_PREFIX)).toBe(true);
    expect(stored.otp).not.toContain(issued.password);
    expect(await bcrypt.compare(issued.password, stored.otp.slice(INVITE_CREDENTIAL_PREFIX.length))).toBe(true);
    expect(issued.password.length).toBeGreaterThanOrEqual(16);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(startedAt);
    expect(mocks.reset.updateMany).toHaveBeenCalledWith({
      where: { email: INVITEE, used: false, otp: { startsWith: INVITE_CREDENTIAL_PREFIX } },
      data: { used: true },
    });
  });

  it("never treats a password-reset code as a sign-in credential", async () => {
    expect(await verifyInviteCredential(INVITEE, "123456")).toBeNull();
    expect(mocks.reset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: INVITEE, used: false, expiresAt: { gt: expect.any(Date) }, otp: { startsWith: INVITE_CREDENTIAL_PREFIX } },
    }));
  });
});

describe("invitation delivery", () => {
  it("emails a new member a temporary password and never returns it", async () => {
    const response = await invite(request({ email: INVITEE, role: "MEMBER" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    const delivered = mocks.sendInvite.mock.calls[0][1].temporaryPassword;
    expect(delivered).toEqual(expect.any(String));
    const stored = mocks.reset.create.mock.calls[0][0].data.otp;
    expect(await bcrypt.compare(delivered, stored.slice(INVITE_CREDENTIAL_PREFIX.length))).toBe(true);
    expect(body).toMatchObject({ email: INVITEE, emailSent: true, isNewUser: true, credentialDelivery: "email" });
    expect(JSON.stringify(body)).not.toContain(delivered);
  });

  it("retires the credential when the invitation email fails", async () => {
    mocks.sendInvite.mockResolvedValue({ success: false });

    const body = await (await invite(request({ email: INVITEE, role: "MEMBER" }))).json();

    expect(body).toMatchObject({ emailSent: false, credentialDelivery: "none" });
    expect(mocks.reset.update).toHaveBeenCalledWith({ where: { id: "credential" }, data: { used: true } });
  });

  it("does not issue a temporary password for an existing account", async () => {
    mocks.user.findUnique.mockImplementation(async ({ where }) =>
      where.email === INVITEE
        ? { id: "existing-user", email: INVITEE, name: "Existing", passwordHash: "hash" }
        : {
            id: "owner", email: "owner@example.test", name: "Owner", isMasterAdmin: false,
            memberships: [{ id: "owner-membership", workspaceId: "workspace-a", role: "OWNER", workspace: { id: "workspace-a", name: "Alpha", plan: "ENTERPRISE" } }],
          },
    );

    const body = await (await invite(request({ email: INVITEE, role: "MEMBER" }))).json();

    expect(body).toMatchObject({ isNewUser: false, credentialDelivery: "existing-account" });
    expect(mocks.reset.create).not.toHaveBeenCalled();
    expect(mocks.sendInvite.mock.calls[0][1].temporaryPassword).toBeUndefined();
  });

  it("resends a fresh temporary password to a member who never set one, instead of 409", async () => {
    mocks.user.findUnique.mockImplementation(async ({ where }) =>
      where.email === INVITEE
        ? { id: "invited-user", email: INVITEE, name: "Invitee", passwordHash: null }
        : {
            id: "owner", email: "owner@example.test", name: "Owner", isMasterAdmin: false,
            memberships: [{ id: "owner-membership", workspaceId: "workspace-a", role: "OWNER", workspace: { id: "workspace-a", name: "Alpha", plan: "ENTERPRISE" } }],
          },
    );
    mocks.member.findUnique.mockResolvedValue({ id: "existing-membership", userId: "invited-user", workspaceId: "workspace-a", role: "MEMBER", user: { id: "invited-user", name: "Invitee", email: INVITEE } });

    const response = await invite(request({ email: INVITEE, role: "MEMBER" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ resent: true, isNewUser: false, credentialDelivery: "email" });
    const delivered = mocks.sendInvite.mock.calls[0][1].temporaryPassword;
    expect(delivered).toEqual(expect.any(String));
    expect(mocks.member.create).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain(delivered);
  });

  it("still refuses to re-invite an already-active member who has a password", async () => {
    mocks.user.findUnique.mockImplementation(async ({ where }) =>
      where.email === INVITEE
        ? { id: "active-user", email: INVITEE, name: "Active", passwordHash: "hash" }
        : {
            id: "owner", email: "owner@example.test", name: "Owner", isMasterAdmin: false,
            memberships: [{ id: "owner-membership", workspaceId: "workspace-a", role: "OWNER", workspace: { id: "workspace-a", name: "Alpha", plan: "ENTERPRISE" } }],
          },
    );
    mocks.member.findUnique.mockResolvedValue({ id: "existing-membership", userId: "active-user", workspaceId: "workspace-a", role: "MEMBER", user: { id: "active-user", name: "Active", email: INVITEE } });

    const response = await invite(request({ email: INVITEE, role: "MEMBER" }));

    expect(response.status).toBe(409);
    expect(mocks.reset.create).not.toHaveBeenCalled();
    expect(mocks.sendInvite).not.toHaveBeenCalled();
    expect(mocks.member.create).not.toHaveBeenCalled();
  });

  it("reports undeliverable invitations instead of creating an unusable credential", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.emailConfigured.mockReturnValue(false);

    const body = await (await invite(request({ email: INVITEE, role: "MEMBER" }))).json();

    expect(body).toMatchObject({ emailSent: false, credentialDelivery: "none" });
    expect(mocks.reset.create).not.toHaveBeenCalled();
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("prints the temporary password to the local console only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.emailConfigured.mockReturnValue(false);
    const terminal = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const body = await (await invite(request({ email: INVITEE, role: "MEMBER" }))).json();

    expect(body).toMatchObject({ emailSent: false, credentialDelivery: "server-console" });
    const printed = String(terminal.mock.calls[0][0]);
    expect(printed).toContain(INVITEE);
    const password = printed.match(/[A-Za-z0-9-]{16,}/g)?.at(-1);
    expect(await bcrypt.compare(password!, mocks.reset.create.mock.calls[0][0].data.otp.slice(INVITE_CREDENTIAL_PREFIX.length))).toBe(true);
    expect(JSON.stringify(body)).not.toContain(password);
    terminal.mockRestore();
  });
});

describe("invitation email", () => {
  it("explains the temporary password, where to sign in and the first-login requirement", () => {
    const payload = buildTeamInviteEmail(INVITEE, {
      workspaceName: "Alpha", inviterName: "Owner", role: "MEMBER", isNewUser: true, temporaryPassword: "Ab3d-Ef7h-Jk2m-Np4q",
    });

    for (const content of [payload.html, payload.text ?? ""]) {
      expect(content).toContain("Ab3d-Ef7h-Jk2m-Np4q");
      expect(content).toContain(INVITEE);
      expect(content).toContain("/auth/login");
      expect(content.toLowerCase()).toContain("temporary password");
      expect(content.toLowerCase()).toContain("choose your own password");
    }
  });

  it("does not mention credentials when the account already exists", () => {
    const payload = buildTeamInviteEmail(INVITEE, { workspaceName: "Alpha", inviterName: "Owner", role: "MEMBER", isNewUser: false });
    expect(`${payload.html}${payload.text}`.toLowerCase()).not.toContain("temporary password");
  });
});

describe("password setup", () => {
  const CHOSEN = "ChosenPassword12";
  beforeEach(() => {
    mocks.session.mockResolvedValue({ user: { email: INVITEE } });
    mocks.user.findUnique.mockResolvedValue({ id: "invited-user", email: INVITEE, name: "Invitee", memberships: [{ workspace: { name: "Alpha" } }] });
    mocks.reset.count.mockResolvedValue(1);
  });

  it.each(["short", "alllowercase12", "NOLOWERCASE12", "NoDigitsHereAll", "Aa1".repeat(30)])(
    "rejects an unusable password before hashing: %s",
    async (newPassword) => {
      const response = await setPassword(request({ newPassword }, "http://localhost/api/account/set-password"));
      expect(response.status).toBe(400);
      expect(mocks.user.update).not.toHaveBeenCalled();
      expect(mocks.sendPasswordSet).not.toHaveBeenCalled();
    },
  );

  it("requires a pending invitation", async () => {
    mocks.reset.count.mockResolvedValue(0);

    const response = await setPassword(request({ newPassword: CHOSEN }, "http://localhost/api/account/set-password"));

    expect(response.status).toBe(409);
    expect(mocks.user.update).not.toHaveBeenCalled();
    expect(mocks.sendPasswordSet).not.toHaveBeenCalled();
  });

  it("stores the chosen password and retires the invitation credential", async () => {
    const response = await setPassword(request({ newPassword: CHOSEN }, "http://localhost/api/account/set-password"));

    expect(response.status).toBe(200);
    const update = mocks.user.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "invited-user" });
    expect(update.data.passwordHash).not.toBe(CHOSEN);
    expect(await bcrypt.compare(CHOSEN, update.data.passwordHash)).toBe(true);
    expect(mocks.reset.updateMany).toHaveBeenCalledWith({
      where: { email: INVITEE, used: false, otp: { startsWith: INVITE_CREDENTIAL_PREFIX } },
      data: { used: true },
    });
  });

  it("sends a welcome email that greets the member and never carries the password", async () => {
    await setPassword(request({ newPassword: CHOSEN }, "http://localhost/api/account/set-password"));

    expect(mocks.sendPasswordSet).toHaveBeenCalledWith(INVITEE, { name: "Invitee", workspaceName: "Alpha" });
    expect(JSON.stringify(mocks.sendPasswordSet.mock.calls[0])).not.toContain(CHOSEN);
  });

  it("still completes setup when the welcome email fails", async () => {
    mocks.sendPasswordSet.mockRejectedValue(new Error("smtp down"));

    const response = await setPassword(request({ newPassword: CHOSEN }, "http://localhost/api/account/set-password"));

    expect(response.status).toBe(200);
    expect(mocks.user.update).toHaveBeenCalled();
  });
});

describe("welcome email content", () => {
  it("greets the member, links the dashboard and contains no password", () => {
    const payload = buildPasswordSetEmail(INVITEE, { name: "Priya", workspaceName: "Alpha" });
    for (const content of [payload.html, payload.text ?? ""]) {
      expect(content).toContain("Priya");
      expect(content).toContain("Alpha");
      expect(content.toLowerCase()).toContain("dashboard");
      expect(content.toLowerCase()).toContain("never include passwords");
    }
    expect(payload.subject.toLowerCase()).not.toContain("password reset");
  });

  it("falls back to a generic greeting without a name", () => {
    const payload = buildPasswordSetEmail(INVITEE);
    expect(payload.html).toContain("Welcome to RegLayer");
    expect(payload.text ?? "").toContain("Welcome to RegLayer");
  });
});

describe("password setup enforcement", () => {
  beforeEach(() => mocks.token.mockResolvedValue({ email: INVITEE, mustSetPassword: true }));

  it("sends product pages to the setup page", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/dashboard"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/set-password");
  });

  it("refuses other product APIs while a temporary password is in use", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/scans"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PASSWORD_SETUP_REQUIRED" });
  });

  it.each(["http://localhost:3000/api/account/set-password", "http://localhost:3000/auth/set-password", "http://localhost:3000/auth/signout"])(
    "allows %s",
    async (url) => {
      const response = await proxy(new NextRequest(url, { method: url.includes("/api/") ? "POST" : "GET", headers: { origin: "http://localhost:3000" } }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("does not restrict members who already chose a password", async () => {
    mocks.token.mockResolvedValue({ email: INVITEE });
    const response = await proxy(new NextRequest("http://localhost:3000/dashboard"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
