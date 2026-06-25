import { describe, it, expect } from "vitest";
import { planProvisioning } from "@/lib/sso/provision";

describe("planProvisioning", () => {
  const base = {
    assertedEmail: "jane@acme.com",
    connectionVerifiedDomains: ["acme.com"],
    defaultRole: "MEMBER" as const,
  };

  it("refuses when the asserted email domain is not a verified domain of the connection", () => {
    expect(planProvisioning({ ...base, assertedEmail: "jane@evil.com" })).toEqual({ ok: false, reason: "domain_mismatch" });
  });

  it("provisions at the connection default role", () => {
    const r = planProvisioning(base);
    expect(r).toMatchObject({ ok: true, role: "MEMBER" });
  });

  it("applies IdP-group → role mapping", () => {
    const r = planProvisioning({
      ...base,
      idpGroups: ["sso-admins"],
      roleMappings: [{ idpGroup: "sso-admins", role: "ADMIN" }],
    });
    expect(r).toMatchObject({ ok: true, role: "ADMIN" });
  });

  it("never downgrades an existing higher role", () => {
    const r = planProvisioning({ ...base, existingRole: "OWNER" });
    expect(r).toMatchObject({ ok: true, role: "OWNER" });
  });

  it("an explicit invite role wins over everything", () => {
    const r = planProvisioning({
      ...base,
      inviteRole: "ADMIN",
      existingRole: "VIEWER",
      idpGroups: ["g"],
      roleMappings: [{ idpGroup: "g", role: "MEMBER" }],
    });
    expect(r).toMatchObject({ ok: true, role: "ADMIN" });
  });

  it("maps fullName onto the User.name column and drops unsupported targets", () => {
    const r = planProvisioning({
      ...base,
      claims: { display: "Jane Doe", dept: "Eng" },
      attributeMappings: [
        { sourceAttr: "display", targetField: "fullName" },
        { sourceAttr: "dept", targetField: "department" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile).toEqual({ name: "Jane Doe" }); // department dropped (no column)
    }
  });
});
