/**
 * Unit tests for buildTeamInviteEmail — the pure invite-email payload builder.
 *
 * Covers the two paths that matter for the team-invite fix: a brand-new user
 * (no password yet → must be routed through the set-password flow) and an
 * existing user (just a sign-in link), plus HTML-escaping of user-controlled
 * names so a workspace/inviter name can't inject markup into the email.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTeamInviteEmail } from "@/lib/email/service";

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});
afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

describe("buildTeamInviteEmail", () => {
  it("addresses and subjects the email to the invitee + workspace", () => {
    const p = buildTeamInviteEmail("new@acme.com", {
      workspaceName: "Acme",
      inviterName: "Dana",
      role: "MEMBER",
      isNewUser: false,
    });
    expect(p.to).toBe("new@acme.com");
    expect(p.subject).toContain("Acme");
  });

  it("routes a NEW user to the password-setup flow (their only way in)", () => {
    const p = buildTeamInviteEmail("new@acme.com", {
      workspaceName: "Acme",
      inviterName: "Dana",
      role: "ADMIN",
      isNewUser: true,
    });
    expect(p.html).toContain("https://app.example.com/auth/forgot-password");
    expect(p.html).toContain("Set your password");
    // The invitee's address must be shown so they know which email to enter.
    expect(p.html).toContain("new@acme.com");
    expect(p.text).toContain("https://app.example.com/auth/forgot-password");
    // Role is presented in title-case.
    expect(p.html).toContain("Admin");
  });

  it("gives an EXISTING user only a sign-in link (no setup flow)", () => {
    const p = buildTeamInviteEmail("dev@acme.com", {
      workspaceName: "Acme",
      inviterName: "Dana",
      role: "VIEWER",
      isNewUser: false,
    });
    expect(p.html).toContain("https://app.example.com/auth/login");
    expect(p.html).not.toContain("/auth/forgot-password");
    expect(p.html).not.toContain("Set your password");
  });

  it("HTML-escapes user-controlled workspace and inviter names", () => {
    const p = buildTeamInviteEmail("x@acme.com", {
      workspaceName: '<script>alert(1)</script>',
      inviterName: 'O"Brien & <b>co</b>',
      role: "MEMBER",
      isNewUser: false,
    });
    expect(p.html).not.toContain("<script>");
    expect(p.html).toContain("&lt;script&gt;");
    expect(p.html).toContain("&amp;");
    expect(p.html).toContain("&quot;");
  });

  it("falls back to the default app URL when NEXT_PUBLIC_APP_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const p = buildTeamInviteEmail("x@acme.com", {
      workspaceName: "Acme",
      inviterName: "Dana",
      role: "MEMBER",
      isNewUser: true,
    });
    expect(p.html).toContain("https://reglayer.vercel.app/auth/forgot-password");
  });
});
