/**
 * RegLayer — Invitation sign-in
 *
 * The temporary password from an invitation must authenticate the invited
 * member, flag them for password setup, and never outrank a chosen password.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  reset: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  rateLimit: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: { user: mocks.user, passwordReset: mocks.reset } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/cache/redis", () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock("@/lib/sso/guards", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/sso/provision-execute", () => ({ applyProvisioning: vi.fn() }));
vi.mock("@/lib/sso/resolve", () => ({ getEnforcementForEmail: vi.fn() }));
vi.mock("@/lib/sso/enforcement", () => ({ evaluateEnforcement: vi.fn() }));
vi.mock("@/lib/auth/profile-refresh", () => ({ emailIsVerified: () => true }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { authOptions } from "@/lib/auth/config";
import { INVITE_CREDENTIAL_PREFIX } from "@/lib/auth/invite-credential";

const EMAIL = "invitee@example.test";
const TEMPORARY = "Ab3d-Ef7h-Jk2m-Np4q";

function signIn(password: string) {
  const provider = authOptions.providers.find((candidate) => candidate.id === "credentials");
  const authorize = (provider as unknown as {
    options: { authorize: (credentials: Record<string, string>, request: unknown) => Promise<unknown> };
  }).options.authorize;
  return authorize({ email: EMAIL, password }, { headers: {} });
}

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.user.findUnique.mockResolvedValue({ id: "invited-user", name: null, email: EMAIL, passwordHash: null });
  mocks.reset.findMany.mockResolvedValue([
    { id: "credential", otp: `${INVITE_CREDENTIAL_PREFIX}${await bcrypt.hash(TEMPORARY, 4)}` },
  ]);
});

describe("invitation sign-in", () => {
  it("admits the invited member and requires password setup", async () => {
    expect(await signIn(TEMPORARY)).toMatchObject({ id: "invited-user", email: EMAIL, mustSetPassword: true });
  });

  it("refuses a wrong or already-retired temporary password", async () => {
    expect(await signIn("Not-The-Invitation")).toBeNull();
    mocks.reset.findMany.mockResolvedValue([]);
    expect(await signIn(TEMPORARY)).toBeNull();
  });

  it("does not require setup once the member has a password of their own", async () => {
    mocks.user.findUnique.mockResolvedValue({
      id: "invited-user", name: "Invitee", email: EMAIL, passwordHash: await bcrypt.hash("ChosenPassword12", 4),
    });

    const result = await signIn("ChosenPassword12");

    expect(result).toMatchObject({ id: "invited-user", email: EMAIL });
    expect(result).not.toHaveProperty("mustSetPassword", true);
    expect(mocks.reset.findMany).not.toHaveBeenCalled();
  });

  it("clears the setup requirement after the invitation is retired", async () => {
    mocks.cacheGet.mockResolvedValue({ isMasterAdmin: false, workspaceRole: "MEMBER", revokedAtSec: null });
    mocks.reset.count.mockResolvedValue(0);

    const jwt = authOptions.callbacks!.jwt!;
    const token = await jwt({ token: { email: EMAIL, mustSetPassword: true }, user: undefined } as never);

    expect(token.mustSetPassword).toBe(false);
  });

  it("keeps the requirement while the invitation is still pending", async () => {
    mocks.cacheGet.mockResolvedValue({ isMasterAdmin: false, workspaceRole: "MEMBER", revokedAtSec: null });
    mocks.reset.count.mockResolvedValue(1);

    const jwt = authOptions.callbacks!.jwt!;
    const token = await jwt({ token: { email: EMAIL, mustSetPassword: true }, user: undefined } as never);

    expect(token.mustSetPassword).toBe(true);
  });
});
