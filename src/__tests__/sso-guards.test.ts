import { describe, it, expect } from "vitest";
import { isPublicDomain, assertionDomainMatches, isSessionRevoked, PUBLIC_EMAIL_DOMAINS } from "@/lib/sso/guards";

describe("isPublicDomain", () => {
  it("flags common freemail providers (case-insensitive)", () => {
    expect(isPublicDomain("gmail.com")).toBe(true);
    expect(isPublicDomain("GMAIL.COM")).toBe(true);
    expect(isPublicDomain("outlook.com")).toBe(true);
    expect(isPublicDomain("proton.me")).toBe(true);
  });
  it("does not flag corporate domains", () => {
    expect(isPublicDomain("acme.com")).toBe(false);
    expect(isPublicDomain("acme.co.uk")).toBe(false);
  });
  it("has a non-trivial blocklist", () => {
    expect(PUBLIC_EMAIL_DOMAINS.size).toBeGreaterThan(10);
  });
});

describe("assertionDomainMatches (provision guard)", () => {
  it("accepts a verified corporate domain", () => {
    expect(assertionDomainMatches("jane@acme.com", ["acme.com"])).toBe(true);
    expect(assertionDomainMatches("Jane@ACME.com", ["acme.com"])).toBe(true);
  });
  it("rejects when the asserted domain is not among the connection's verified domains", () => {
    expect(assertionDomainMatches("jane@evil.com", ["acme.com"])).toBe(false);
  });
  it("rejects public/freemail domains even if (mis)listed", () => {
    expect(assertionDomainMatches("jane@gmail.com", ["gmail.com"])).toBe(false);
  });
  it("rejects malformed emails", () => {
    expect(assertionDomainMatches("not-an-email", ["acme.com"])).toBe(false);
    expect(assertionDomainMatches("jane@", ["acme.com"])).toBe(false);
  });
  it("supports multi-domain orgs", () => {
    expect(assertionDomainMatches("j@acme.co.uk", ["acme.com", "acme.co.uk"])).toBe(true);
  });
});

describe("isSessionRevoked (deprovisioning)", () => {
  it("is not revoked when there is no revocation timestamp", () => {
    expect(isSessionRevoked(1000, null)).toBe(false);
  });
  it("revokes tokens issued before the revocation time", () => {
    expect(isSessionRevoked(1000, 2000)).toBe(true);
  });
  it("keeps tokens issued at/after the revocation time", () => {
    expect(isSessionRevoked(2000, 2000)).toBe(false);
    expect(isSessionRevoked(3000, 2000)).toBe(false);
  });
  it("fails closed when the token has no issue time", () => {
    expect(isSessionRevoked(undefined, 2000)).toBe(true);
  });
});
