/**
 * RegLayer — SSO load test (#36): discovery endpoint at 100 / 500 / 1000 VUs.
 *
 * POST /api/auth/sso/discovery is the public, hot SSO surface (every "Continue
 * with SSO" click hits it) — it does the email→verified-domain→connection lookup.
 * The IdP round-trip (authorize → SAML → ACS) can't be load-tested without a
 * load-capable IdP, so this covers the part we own.
 *
 * Run:  k6 run -e BASE_URL=http://localhost:3000 scripts/load/sso-discovery.k6.js
 *
 * NOTE: discovery is rate-limited (~60/min per IP). From a single host you'll hit
 * 429s under load — that's the limiter working, not a capacity ceiling. To measure
 * raw capacity, run from distributed IPs or against a build with the limiter
 * relaxed for the test.
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "1m", target: 500 },
    { duration: "1m", target: 1000 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    // 429 (rate-limited) is an expected, handled response — not a failure.
    "http_req_failed{expected_response:true}": ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export default function ssoDiscoveryLoad() {
  const res = http.post(
    `${BASE}/api/auth/sso/discovery`,
    JSON.stringify({ email: `user${__VU}-${__ITER}@example.com` }),
    { headers: { "Content-Type": "application/json" }, responseCallback: http.expectedStatuses(200, 429) },
  );
  check(res, {
    "200 or 429": (r) => r.status === 200 || r.status === 429,
    "200 returns {available}": (r) => r.status !== 200 || r.json("available") !== undefined,
  });
}
