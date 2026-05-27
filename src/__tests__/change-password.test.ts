import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({
  authOptions: {},
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/database/prisma";
import bcrypt from "bcryptjs";
import { POST } from "@/app/api/auth/change-password/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const req = makeRequest({ currentPassword: "old", newPassword: "newpass123" });
    const res = await POST(req as any);

    expect(res.status).toBe(401);
  });

  it("returns 400 for missing passwords", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);

    const req = makeRequest({ currentPassword: "", newPassword: "" });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns 400 when new password is too short", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);

    const req = makeRequest({ currentPassword: "oldpass", newPassword: "short" });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("8 characters");
  });

  it("returns 400 for OAuth accounts (no password hash)", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "oauth@test.com" },
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      passwordHash: null,
    } as any);

    const req = makeRequest({ currentPassword: "oldpass", newPassword: "newpass123" });
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("OAuth");
  });

  it("returns 403 when current password is wrong", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      passwordHash: "$2a$12$hash",
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const req = makeRequest({ currentPassword: "wrongpass", newPassword: "newpass123" });
    const res = await POST(req as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("incorrect");
  });

  it("updates password and returns success", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "user@test.com" },
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      passwordHash: "$2a$12$oldhash",
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("$2a$12$newhash" as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const req = makeRequest({ currentPassword: "oldpass", newPassword: "newpass123" });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith("newpass123", 12);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "$2a$12$newhash" },
    });
  });
});
