import { describe, it, expect } from "vitest";
import { evaluateEnforcement } from "@/lib/sso/enforcement";

describe("evaluateEnforcement", () => {
  const base = { provider: "credentials", isWorkspaceOwner: false, isMasterAdmin: false } as const;

  it("allows the SSO provider itself unconditionally", () => {
    expect(evaluateEnforcement({ ...base, provider: "boxyhq-saml", policy: "ENFORCED" })).toEqual({ allow: true, breakGlass: false });
  });

  it("allows non-SSO logins when no connection governs the domain", () => {
    expect(evaluateEnforcement({ ...base, policy: null })).toEqual({ allow: true, breakGlass: false });
  });

  it("allows non-SSO logins under OPTIONAL policy", () => {
    expect(evaluateEnforcement({ ...base, policy: "OPTIONAL" })).toEqual({ allow: true, breakGlass: false });
  });

  it("blocks a non-SSO login for a regular member under ENFORCED", () => {
    expect(evaluateEnforcement({ ...base, policy: "ENFORCED" })).toEqual({ allow: false, reason: "sso_required" });
    expect(evaluateEnforcement({ ...base, policy: "ENFORCED_VERIFIED_DOMAINS" })).toEqual({ allow: false, reason: "sso_required" });
  });

  it("allows a workspace OWNER via break-glass under enforcement", () => {
    expect(evaluateEnforcement({ ...base, policy: "ENFORCED", isWorkspaceOwner: true })).toEqual({ allow: true, breakGlass: true });
  });

  it("allows a master admin via break-glass under enforcement", () => {
    expect(evaluateEnforcement({ ...base, policy: "ENFORCED", isMasterAdmin: true })).toEqual({ allow: true, breakGlass: true });
  });

  it("does not mark break-glass for ordinary allowed logins", () => {
    const r = evaluateEnforcement({ ...base, policy: "OPTIONAL", isWorkspaceOwner: true });
    expect(r).toEqual({ allow: true, breakGlass: false });
  });
});
