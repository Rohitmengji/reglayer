import { describe, it, expect } from "vitest";
import { canClaimDomain } from "@/lib/sso/verified-domains";

describe("canClaimDomain", () => {
  it("allows an unclaimed corporate domain", () => {
    expect(canClaimDomain("acme.com", "ws1", [])).toEqual({ ok: true, domain: "acme.com" });
  });
  it("normalizes case / leading @", () => {
    expect(canClaimDomain("@ACME.com", "ws1", [])).toEqual({ ok: true, domain: "acme.com" });
  });
  it("rejects public/freemail domains", () => {
    expect(canClaimDomain("gmail.com", "ws1", [])).toEqual({ ok: false, reason: "public" });
  });
  it("rejects malformed domains", () => {
    expect(canClaimDomain("not-a-domain", "ws1", [])).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects a domain already verified by another workspace", () => {
    const existing = [{ domain: "acme.com", workspaceId: "ws2" }];
    expect(canClaimDomain("acme.com", "ws1", existing)).toEqual({ ok: false, reason: "taken_by_other" });
  });
  it("is idempotent for the owning workspace re-claiming its own domain", () => {
    const existing = [{ domain: "acme.com", workspaceId: "ws1" }];
    expect(canClaimDomain("acme.com", "ws1", existing)).toEqual({ ok: true, domain: "acme.com" });
  });
});
