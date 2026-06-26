import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  domainFromEmail,
  isVerifiedRoutable,
  resolveConnectionForEmail,
  resolveProvisionedRole,
  mapAttributes,
  expectedTxtRecord,
  dnsTxtContainsToken,
  type SsoConnectionInput,
} from "@/lib/sso/routing";

function conn(p: Partial<SsoConnectionInput> & { domains: SsoConnectionInput["domains"] }): SsoConnectionInput {
  return { id: "c1", workspaceId: "w1", rolloutStage: "GA", disabledAt: null, deletedAt: null, ...p };
}
const verified = (domain: string) => ({ domain, verificationStatus: "VERIFIED" as const, deletedAt: null });

describe("domain helpers", () => {
  it("normalizes domains", () => {
    expect(normalizeDomain("  @Acme.COM ")).toBe("acme.com");
    expect(normalizeDomain("mailto:Foo.io")).toBe("foo.io");
  });
  it("extracts domain from email", () => {
    expect(domainFromEmail("Jane@Acme.com")).toBe("acme.com");
    expect(domainFromEmail("bad")).toBeNull();
    expect(domainFromEmail("a@b")).toBeNull(); // no TLD
    expect(domainFromEmail("@acme.com")).toBeNull();
  });
  it("routes only verified, non-deleted domains", () => {
    expect(isVerifiedRoutable(verified("acme.com"))).toBe(true);
    expect(isVerifiedRoutable({ domain: "acme.com", verificationStatus: "PENDING", deletedAt: null })).toBe(false);
    expect(isVerifiedRoutable({ domain: "acme.com", verificationStatus: "VERIFIED", deletedAt: new Date() })).toBe(false);
  });
});

describe("resolveConnectionForEmail", () => {
  it("resolves a verified GA connection", () => {
    const r = resolveConnectionForEmail("jane@acme.com", [conn({ domains: [verified("acme.com")] })]);
    expect(r).toEqual({ ok: true, connectionId: "c1", workspaceId: "w1" });
  });
  it("no_email for malformed input", () => {
    expect(resolveConnectionForEmail("nope", [])).toMatchObject({ ok: false, reason: "no_email" });
  });
  it("unknown_domain when no connection claims it", () => {
    expect(resolveConnectionForEmail("jane@other.com", [conn({ domains: [verified("acme.com")] })]))
      .toMatchObject({ ok: false, reason: "unknown_domain" });
  });
  it("domain_unverified when claimed but not verified", () => {
    const c = conn({ domains: [{ domain: "acme.com", verificationStatus: "PENDING", deletedAt: null }] });
    expect(resolveConnectionForEmail("jane@acme.com", [c])).toMatchObject({ ok: false, reason: "domain_unverified" });
  });
  it("connection_disabled when the owning connection is soft-disabled", () => {
    const c = conn({ disabledAt: new Date(), domains: [verified("acme.com")] });
    expect(resolveConnectionForEmail("jane@acme.com", [c])).toMatchObject({ ok: false, reason: "connection_disabled" });
  });
  it("rollout_excluded when stage not allowed", () => {
    const c = conn({ rolloutStage: "BETA", domains: [verified("acme.com")] });
    expect(resolveConnectionForEmail("jane@acme.com", [c])).toMatchObject({ ok: false, reason: "rollout_excluded" });
    // ...but allowed when BETA is permitted
    expect(resolveConnectionForEmail("jane@acme.com", [c], { allowedStages: ["GA", "BETA"] })).toMatchObject({ ok: true });
  });
  it("ignores soft-deleted connections and domains", () => {
    const deleted = conn({ id: "old", deletedAt: new Date(), domains: [verified("acme.com")] });
    expect(resolveConnectionForEmail("jane@acme.com", [deleted])).toMatchObject({ ok: false, reason: "unknown_domain" });
  });
});

describe("resolveProvisionedRole (precedence)", () => {
  const mappings = [{ idpGroup: "eng-admins", role: "ADMIN" as const }, { idpGroup: "leads", role: "OWNER" as const }];
  it("invite role wins outright", () => {
    expect(resolveProvisionedRole({ inviteRole: "MEMBER", existingRole: "OWNER", defaultRole: "VIEWER" })).toBe("MEMBER");
  });
  it("never downgrades an existing higher role", () => {
    expect(resolveProvisionedRole({ existingRole: "ADMIN", defaultRole: "MEMBER" })).toBe("ADMIN");
  });
  it("uses IdP group mapping over default", () => {
    expect(resolveProvisionedRole({ idpGroups: ["eng-admins"], roleMappings: mappings, defaultRole: "MEMBER" })).toBe("ADMIN");
  });
  it("picks the highest matched group but never mints OWNER (caps at ADMIN)", () => {
    // leads→OWNER ranks highest, but SSO must never auto-provision OWNER.
    expect(resolveProvisionedRole({ idpGroups: ["eng-admins", "leads"], roleMappings: mappings, defaultRole: "VIEWER" })).toBe("ADMIN");
  });
  it("never mints OWNER from a connection defaultRole (caps at ADMIN)", () => {
    expect(resolveProvisionedRole({ defaultRole: "OWNER" })).toBe("ADMIN");
  });
  it("never mints OWNER from an invite role (caps at ADMIN)", () => {
    expect(resolveProvisionedRole({ inviteRole: "OWNER", defaultRole: "VIEWER" })).toBe("ADMIN");
  });
  it("falls back to default when no mapping matches", () => {
    expect(resolveProvisionedRole({ idpGroups: ["unknown"], roleMappings: mappings, defaultRole: "MEMBER" })).toBe("MEMBER");
  });
  it("group mapping does not downgrade existing role", () => {
    expect(resolveProvisionedRole({ existingRole: "OWNER", idpGroups: ["eng-admins"], roleMappings: mappings, defaultRole: "MEMBER" })).toBe("OWNER");
  });
  it("preserves an EXISTING owner even when a rogue OWNER mapping matches (never-downgrade ≠ minting)", () => {
    expect(resolveProvisionedRole({ existingRole: "OWNER", idpGroups: ["leads"], roleMappings: mappings, defaultRole: "MEMBER" })).toBe("OWNER");
  });
  it("matches groups case-insensitively (IdP casing drift must not drop to default)", () => {
    expect(resolveProvisionedRole({ idpGroups: ["ENG-Admins"], roleMappings: mappings, defaultRole: "MEMBER" })).toBe("ADMIN");
    expect(resolveProvisionedRole({ idpGroups: ["eng-admins"], roleMappings: [{ idpGroup: "ENG-ADMINS", role: "ADMIN" }], defaultRole: "VIEWER" })).toBe("ADMIN");
  });
});

describe("mapAttributes", () => {
  it("maps present string/number claims, skips missing/empty", () => {
    const out = mapAttributes(
      { given_name: "Jane", family_name: "Doe", dept: "  ", emp_no: 42, nope: null },
      [
        { sourceAttr: "given_name", targetField: "firstName" },
        { sourceAttr: "family_name", targetField: "lastName" },
        { sourceAttr: "dept", targetField: "department" },
        { sourceAttr: "emp_no", targetField: "employeeId" },
        { sourceAttr: "nope", targetField: "title" },
      ]
    );
    expect(out).toEqual({ firstName: "Jane", lastName: "Doe", employeeId: "42" });
  });
});

describe("DNS TXT verification", () => {
  it("builds + matches the expected record", () => {
    const token = "abc123";
    expect(expectedTxtRecord(token)).toBe("reglayer-verification=abc123");
    expect(dnsTxtContainsToken(["v=spf1 -all", " reglayer-verification=abc123 "], token)).toBe(true);
    expect(dnsTxtContainsToken(["reglayer-verification=wrong"], token)).toBe(false);
  });
});
