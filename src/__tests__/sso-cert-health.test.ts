// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseCertNotAfterFromSamlMetadata, evaluateCertHealth, shouldAlertAt } from "@/lib/sso/cert-health";

// Real mocksaml.com signing cert (notAfter is in the year 3021).
const MOCKSAML_METADATA = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://saml.example.com/entityid">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>MIIC4jCCAcoCCQC33wnybT5QZDANBgkqhkiG9w0BAQsFADAyMQswCQYDVQQGEwJV
SzEPMA0GA1UECgwGQm94eUhRMRIwEAYDVQQDDAlNb2NrIFNBTUwwIBcNMjIwMjI4
MjE0NjM4WhgPMzAyMTA3MDEyMTQ2MzhaMDIxCzAJBgNVBAYTAlVLMQ8wDQYDVQQK
DAZCb3h5SFExEjAQBgNVBAMMCU1vY2sgU0FNTDCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBALGfYettMsct1T6tVUwTudNJH5Pnb9GGnkXi9Zw/e6x45DD0
RuRONbFlJ2T4RjAE/uG+AjXxXQ8o2SZfb9+GgmCHuTJFNgHoZ1nFVXCmb/Hg8Hpd
4vOAGXndixaReOiq3EH5XvpMjMkJ3+8+9VYMzMZOjkgQtAqO36eAFFfNKX7dTj3V
pwLkvz6/KFCq8OAwY+AUi4eZm5J57D31GzjHwfjH9WTeX0MyndmnNB1qV75qQR3b
2/W5sGHRv+9AarggJkF+ptUkXoLtVA51wcfYm6hILptpde5FQC8RWY1YrswBWAEZ
NfyrR4JeSweElNHg4NVOs4TwGjOPwWGqzTfgTlECAwEAATANBgkqhkiG9w0BAQsF
AAOCAQEAAYRlYflSXAWoZpFfwNiCQVE5d9zZ0DPzNdWhAybXcTyMf0z5mDf6FWBW
5Gyoi9u3EMEDnzLcJNkwJAAc39Apa4I2/tml+Jy29dk8bTyX6m93ngmCgdLh5Za4
khuU3AM3L63g7VexCuO7kwkjh/+LqdcIXsVGO6XDfu2QOs1Xpe9zIzLpwm/RNYeX
UjbSj5ce/jekpAw7qyVVL4xOyh8AtUW1ek3wIw1MJvEgEPt0d16oshWJpoS1OT8L
r/22SvYEo3EmSGdTVGgk3x3s+A0qWAqTcyjr7Q4s/GKYRFfomGwz0TZ4Iw1ZN99M
m0eo2USlSRTVl7QHRTuiuSThHpLKQQ==</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

describe("parseCertNotAfterFromSamlMetadata", () => {
  it("extracts the signing cert's notAfter from real metadata", () => {
    const d = parseCertNotAfterFromSamlMetadata(MOCKSAML_METADATA);
    expect(d).toBeInstanceOf(Date);
    expect(d!.getUTCFullYear()).toBe(3021);
  });
  it("returns null when there is no cert", () => {
    expect(parseCertNotAfterFromSamlMetadata("<md:EntityDescriptor/>")).toBeNull();
  });
  it("returns null for an unparseable cert block", () => {
    expect(parseCertNotAfterFromSamlMetadata("<X509Certificate>not-base64-cert</X509Certificate>")).toBeNull();
  });
});

describe("evaluateCertHealth", () => {
  const now = new Date("2026-06-25T00:00:00Z");
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000);

  it("is ACTIVE with null days when no expiry is tracked", () => {
    expect(evaluateCertHealth({ certExpiresAt: null, now, warningThresholdDays: 30 })).toEqual({ status: "ACTIVE", daysUntilExpiry: null });
  });
  it("is ACTIVE well before the warning threshold", () => {
    expect(evaluateCertHealth({ certExpiresAt: inDays(90), now, warningThresholdDays: 30 })).toMatchObject({ status: "ACTIVE", daysUntilExpiry: 90 });
  });
  it("is WARNING within the threshold", () => {
    expect(evaluateCertHealth({ certExpiresAt: inDays(20), now, warningThresholdDays: 30 })).toMatchObject({ status: "WARNING", daysUntilExpiry: 20 });
  });
  it("is EXPIRED_CERT at/after expiry", () => {
    expect(evaluateCertHealth({ certExpiresAt: inDays(-1), now, warningThresholdDays: 30 }).status).toBe("EXPIRED_CERT");
  });
});

describe("shouldAlertAt", () => {
  it("alerts only at the fixed day-marks", () => {
    for (const d of [90, 60, 30, 14, 7, 1]) expect(shouldAlertAt(d)).toBe(true);
    for (const d of [91, 45, 15, 2, 0, -3]) expect(shouldAlertAt(d)).toBe(false);
    expect(shouldAlertAt(null)).toBe(false);
  });
});
