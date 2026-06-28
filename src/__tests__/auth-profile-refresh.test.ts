import { describe, it, expect } from "vitest";
import { emailIsVerified } from "@/lib/auth/profile-refresh";

describe("emailIsVerified", () => {
  it("trusts credentials and SSO (domain-verified) sign-ins", () => {
    expect(emailIsVerified("credentials", undefined)).toBe(true);
    expect(emailIsVerified("boxyhq-saml", { groups: [] })).toBe(true);
  });
  it("requires email_verified=true for OAuth providers like Google", () => {
    expect(emailIsVerified("google", { email_verified: true })).toBe(true);
    expect(emailIsVerified("google", { email_verified: false })).toBe(false);
    expect(emailIsVerified("google", {})).toBe(false); // claim absent → not verified
    expect(emailIsVerified("google", undefined)).toBe(false);
  });
  it("is false for unknown/missing providers without a verified claim", () => {
    expect(emailIsVerified(undefined, undefined)).toBe(false);
    expect(emailIsVerified("github", { email_verified: "yes" })).toBe(false); // non-boolean → not verified
  });
});
