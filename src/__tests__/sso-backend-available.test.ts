/**
 * Unit tests for ssoBackendAvailable() — the gate that decides whether the SSO
 * admin surface is operational (real backend) or should degrade to the honest
 * "not provisioned" 503 state instead of 502ing on first use.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ssoBackendAvailable } from "@/lib/sso/backend";

const saved: Record<string, string | undefined> = {};
const KEYS = ["SSO_BACKEND", "SSO_JACKSON_URL", "SSO_JACKSON_API_KEY", "NODE_ENV"];

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("ssoBackendAvailable", () => {
  it("service mode is available only when BOTH url + api key are set", () => {
    setEnv({ SSO_BACKEND: "service", SSO_JACKSON_URL: "https://sso.example.com", SSO_JACKSON_API_KEY: "k" });
    expect(ssoBackendAvailable()).toBe(true);
  });

  it("service mode is NOT available without the url", () => {
    setEnv({ SSO_BACKEND: "service", SSO_JACKSON_URL: undefined, SSO_JACKSON_API_KEY: "k" });
    expect(ssoBackendAvailable()).toBe(false);
  });

  it("service mode is NOT available without the api key", () => {
    setEnv({ SSO_BACKEND: "service", SSO_JACKSON_URL: "https://sso.example.com", SSO_JACKSON_API_KEY: undefined });
    expect(ssoBackendAvailable()).toBe(false);
  });

  it("embedded mode is NOT available in production (@boxyhq is a devDependency)", () => {
    setEnv({ SSO_BACKEND: undefined, NODE_ENV: "production" });
    expect(ssoBackendAvailable()).toBe(false);
  });

  it("embedded mode IS available in dev/test (devDependency present)", () => {
    setEnv({ SSO_BACKEND: undefined, NODE_ENV: "development" });
    expect(ssoBackendAvailable()).toBe(true);
  });
});
