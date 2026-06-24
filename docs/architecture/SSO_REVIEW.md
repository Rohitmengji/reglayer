# Enterprise SSO — Adversarial Architecture Review (pre-GA)

> Reviews the in-progress multi-tenant SSO (Prisma models in `prisma/schema.prisma` + pure logic in `src/lib/sso/routing.ts`, both already in main). Mandate: **do not assume the plan is correct** — challenge every decision, surface hidden risks, propose safer alternatives, and validate scalability to **10,000+ tenants**. Severity tags: 🔴 must-fix before GA · 🟠 fix before scale · 🟡 follow-up.

## What's already solid (keep)
`src/lib/sso/routing.ts` is well-built: **server-derived, verified-only, fail-safe** routing (never trusts a client tenant); role precedence with **never-downgrade** + **default-deny** group mapping; typed non-revealing failure reasons; DNS-TXT verification; pure/unit-testable. The schema is comprehensive (health, cert, soft-delete, SCIM-reserved, enforcement, rollout). The review below is about what the design does *not* yet guarantee.

## 🔴 Must-fix before GA

1. **JWT sessions are not revocable → no instant deprovisioning.** NextAuth uses `strategy: "jwt"`, 24h, no DB adapter (`src/lib/auth/config.ts`). When an employee is removed from the IdP/fired, their existing RegLayer JWT stays valid up to 24h — enterprises require *immediate* termination. "Keep account active + `lastSSOLoginAt`" doesn't address live sessions.
   **Safer:** the `jwt` callback already does a Redis `auth:ctx:${email}` lookup (config.ts:197) — extend it with a **revocation epoch** (`auth:revoked:${userId|workspace}`); if the token was issued before the epoch, force re-auth. Cheap, uses existing Upstash. (Longer-term: Auth.js v5 DB sessions — see #11.)

2. **Verified-domain uniqueness rests on a raw partial-unique index under a `db push` workflow → cross-tenant hijack risk.** Prisma can't express the partial unique (`WHERE verified AND not deleted`); the repo uses `prisma db push` (no migrations dir), so the raw index can be silently dropped on a reset, leaving only an app-layer check with a concurrency race. If two workspaces verify the same domain, routing sends one tenant's employees to the other.
   **Safer:** a dedicated **`VerifiedDomain` table** (only currently-verified domains) with a native Prisma `@@unique([domain])` — migration-safe, race-safe. Insert on verify (in a txn), delete on soft-delete. Removes the raw-SQL fragility entirely.

3. **Enforcement requires a guaranteed, un-lockout-able break-glass.** v1 is additive (password/Google always work) — good, that *is* v1's break-glass. But `enforcementPolicy=ENFORCED` must not be enable-able unless a recovery path exists that SSO can't break (owner recovery code / out-of-band), and every break-glass use must alert + audit.

4. **Provisioning must re-check the asserted email domain == connection's verified domain.** Routing resolves the connection; the **provision step** must independently confirm the IdP-asserted email's domain is a verified domain of that connection before granting membership — defense-in-depth against a misrouted/forged assertion landing a user in the wrong tenant. (Add an `assertionDomainMatches` guard at provision, not just at discovery.)

## 🟠 Scalability to 10,000+ tenants

5. **Embedded Jackson is the wrong default at this scale.** Embedding `@boxyhq/saml-jackson` means every serverless cold-start re-inits Jackson and opens Postgres connections (Jackson **and** Prisma) → connection-pool exhaustion on Neon under concurrent login bursts; Jackson's tables share the app DB; its CVEs run in your auth process; it bloats the bundle.
   **Safer:** run **Jackson as a separate long-lived service** (own DB + pooler), called over HTTPS — independent scaling, isolated blast radius, no per-lambda init. If staying embedded, mandate a connection pooler (Neon/PgBouncer), hard pool caps, and a cold-start latency + connection load test before GA. **Recommend reversing the "embedded" default.**

6. **Per-login lookups & writes don't scale.** Discovery does a domain→connection DB query per login → **cache** verified-domain→connection in Redis (short TTL, invalidate on change). `lastLoginAt/lastSSOLoginAt` updates per login → hot-row write amplification → **throttle** (update only if stale > N min) or append to a login-events table.

7. **Audit/security-event volume.** SSO success/fail + security events × 10k tenants → unbounded `AuditLog` growth + slow queries. **Partition + retention**, or a separate high-volume security-event sink; per-tenant retention aligned to compliance.

8. **Cron fan-out (cert expiry, self-healing).** Scanning/pinging 10k connections' metadata/certs must **batch, paginate, and stagger** — never load-all or hammer IdP endpoints.

9. **Multi-region determinism.** When EU regions land (the deferred residency work), tenant routing, the revocation store, and Jackson's store must be globally consistent or deterministically region-pinned per tenant — otherwise a tenant's login behaves differently by region.

## 🟡 Routing brittleness & correctness

10. **Email-domain-only routing + missing freemail guard.** `routing.ts` keys on email domain and has **no public/freemail blocklist** (DNS-TXT on `gmail.com` naturally can't pass, but add an explicit blocklist as defense-in-depth). Domain routing also fails contractors/M&A/shared domains.
    **Safer:** support **IdP-initiated SSO** and **workspace-slug routing** (`/sso/<slug>`) alongside email; add the freemail blocklist; offer **invite-gated JIT** (don't auto-create accounts for everyone at a domain when the customer wants an allowlist); **periodic domain re-verification** (lapsed-DNS takeover).

## Migration / maintainability

11. **NextAuth v4 is end-of-line; Auth.js v5 is the path** (and it natively supports DB sessions, solving #1). Building deep auth-critical SSO on v4 incurs a future auth migration. **Decide now:** migrate first, or accept the debt knowingly. 🟠
12. **`db push` is unsafe for auth-critical schema** — introduce real Prisma **migrations** for the SSO tables; never `db push` SSO changes to prod unreviewed. 🟠
13. **Attribute mapping targets columns that don't exist.** `SsoAttributeTarget` enumerates `department/title/location/employeeId`, but `User` has only `name`/`image`. The feature is currently a no-op surface. Either add the columns or descope attribute-mapping from GA. 🟡
14. **Scope risk (45 requirements).** High odds of many half-built features. **Ship a ruthlessly minimal, correct, secure GA:** OIDC+SAML via Jackson, DNS domain verify, JIT (+re-check #4), audit, rate-limit, break-glass, **revocation (#1)**. Defer role/attribute mapping, multi-IdP, enforcement, SCIM-wiring, self-healing, and load infra to fast-follows. 🟠

## Security / compliance

15. **Encrypt IdP secrets at rest** (OIDC client secrets / SAML signing material in Jackson's store) — verify Jackson encryption or wrap with `src/lib/crypto.ts` AES-GCM. 🟠
16. **OAuth bridge hardening** — strict redirect-URI allowlist, `state`/`nonce`/PKCE validation, CSRF on form posts, session rotation on privilege change, SAML replay/signature (Jackson) — audit all flows. 🟠
17. **GDPR** — minimize stored IdP claims; define retention for SSO audit/identity data; ensure account-deletion (`src/app/api/account/route.ts`) also purges SSO connections/domains/claims. 🟡

## Decisions needed (reversals of earlier "recommended defaults")
- **Jackson hosting:** embedded → **separate service** (recommend) for 10k scale.
- **Domain uniqueness:** raw partial-index → **`VerifiedDomain` table** (recommend).
- **Session revocation:** add **Redis revocation-epoch now** (recommend); Auth.js v5 DB sessions later.
- **GA scope cut** (recommend the minimal core in #14).
- **`db push` → migrations** for SSO tables (recommend).

## Verdict
The pure routing core is sound, but as-specified the system is **not yet enterprise-production-ready**: it can't revoke sessions on deprovision (#1), its cross-tenant safety leans on a fragile raw index (#2), and the embedded-Jackson default won't survive 10k-tenant serverless load (#5). Address #1–#5 (and cut GA scope to #14) before exposing SSO beyond INTERNAL/BETA.
