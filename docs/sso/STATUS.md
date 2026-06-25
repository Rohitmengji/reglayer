# Enterprise SSO — build status & how to finish (START HERE)

This is the "pick up here" doc. Enterprise SSO (multi-tenant SAML/OIDC) is **fully
built and merged to main**, but **gated OFF** and **not yet provisioned** on any
deployment. Nothing below is a code task — what remains is deployment +
configuration that needs infra/secrets access.

> **TL;DR**
> - The code is done (see [What's built](#whats-built)).
> - On `reglayer.vercel.app` the login shows *"Single sign-on isn't set up for this
>   email domain"* — that's **correct**: SSO isn't provisioned there (no DB tables,
>   `SSO_ENABLED` unset, no SSO engine, no connection). See [Why](#why-not-set-up).
> - **To see it work today:** [Path A — local dev](#path-a) (~10 min, zero infra).
> - **To make the deployed app do SSO:** [Path B — production](#path-b) (stand up
>   Jackson + 4 env vars + `prisma db push`).
> - Keep pricing `sso` = "coming soon" until a real-IdP round-trip succeeds.

---

## <a id="whats-built"></a>1. What's built (all merged to `main`)

| PR | What |
|---|---|
| #341 | Data model + pure routing/guards engine; OAuth bridge (`/api/auth/sso/*`) + NextAuth `boxyhq-saml` provider + JIT provisioning; **embedded** + **service** backends behind the `SsoBackend` seam; admin API (`/api/sso/connections…`) + admin UI (`/settings/sso`); session revocation |
| #350 | Enforcement policy (Optional/Required) + **break-glass**; discovery endpoint degrades gracefully (no 500) |
| #351 | Certificate-expiry + connection-health monitoring with owner email alerts |
| #352 | Per-IdP setup guides (Okta / Entra / Google Workspace) + troubleshooting |
| #353 | **Self-healing** — active metadata/OIDC reachability probes (SSRF-guarded) |
| #354 | Standalone Jackson **deploy kit** (compose + env + runbook + smoke test) |

Verified by ~570 unit tests + adversarial review on every PR. **Not** verified:
the live browser SAML round-trip (needs a running IdP — that's [Path A](#path-a)/[B](#path-b)).

---

## <a id="why-not-set-up"></a>2. Why the deployed app says "SSO isn't set up"

All four are currently true on `reglayer.vercel.app`; any one produces that message:

1. **Prod DB has no SSO tables** — `prisma db push` hasn't run against prod.
2. **`SSO_ENABLED` is unset** on Vercel → the SSO provider doesn't load.
3. **No SSO engine is reachable** — embedded Jackson is a **devDependency** (kept
   out of production builds; see [§3](#architecture)), and no standalone Jackson runs.
4. **No connection / verified domain** exists for the email's domain.

The app is behaving correctly — the feature is simply un-provisioned.

---

## <a id="architecture"></a>3. Architecture in 60 seconds

- All SSO transport goes through one seam: `src/lib/sso/backend.ts` (`getSsoBackend()`),
  selected by the `SSO_BACKEND` env var.
- **`embedded`** (default) — Jackson runs in-process via `@boxyhq/saml-jackson`.
  That package is a **devDependency** because its dependency tree carries
  high-severity, partly-unfixable vulnerabilities that fail
  `npm audit --omit=dev --audit-level=high`. So embedded works in **local dev / CI
  only** — never in a production build.
- **`service`** — an HTTP client (`JacksonServiceBackend`) to a **standalone**
  Jackson container, keeping that dependency tree out of our app. **This is the
  production path.**
- Switching is one env var; the app code (routes, provider, JIT, admin UI) is identical.

---

## <a id="path-a"></a>4. Path A — test SSO locally NOW (~10 min, no infra)

Embedded Jackson works in `npm run dev`. Against mocksaml.com:

```bash
# 1. create the SSO tables in your dev database
npx prisma db push

# 2. enable SSO locally
echo 'SSO_ENABLED=true' >> .env.local

# 3. run
npm run dev
```

Then in the browser:
1. Make your workspace **ENTERPRISE** (master-admin `POST /api/admin` `changePlan`, or set `Workspace.plan=ENTERPRISE`).
2. Sign in as an **OWNER/ADMIN** → go to **`/settings/sso`** → **Add connection** →
   SAML → metadata URL `https://mocksaml.com/api/saml/metadata` → Create.
3. **Add a domain** → publish the shown `reglayer-verification=<token>` DNS TXT
   record and **Verify** (or, dev shortcut, mark it verified directly — see
   [SSO_TESTING.md](../SSO_TESTING.md)).
4. Raise the connection's **rollout stage** above `Disabled`.
5. Sign out → `/auth/login` → enter an email **on that verified domain** →
   **Continue with SSO** → mocksaml → you're provisioned back in.

Full detail + the dev DNS shortcut: **[SSO_TESTING.md](../SSO_TESTING.md)**.

---

## <a id="path-b"></a>5. Path B — make the DEPLOYED app do SSO

Needs three things only you can do (infra + Vercel secrets + prod DB). The kit is
in [`deploy/jackson/`](../../deploy/jackson/); full runbook:
**[service-backend.md](./service-backend.md)**.

1. **Run a Jackson service.** Either `deploy/jackson/docker-compose.yml`, **or**
   use **BoxyHQ's hosted Jackson** (no container — fastest). Put it behind HTTPS;
   set its `SAML_AUDIENCE` to exactly the SP Entity ID in [README.md](./README.md).
2. **Set these Vercel env vars** (Production):
   ```
   SSO_ENABLED=true
   SSO_BACKEND=service
   SSO_JACKSON_URL=<your jackson https url>
   SSO_JACKSON_API_KEY=<the api key you configured in jackson>
   ```
3. **Migrate the prod DB:** `npx prisma db push` (additive — safe).
4. **Verify the wiring:** `npx tsx scripts/smoke-sso-service.ts` (creates a
   throwaway mocksaml connection against your Jackson, asserts the redirect,
   deletes it). Expect `✅ PASS`.
5. Configure a real connection in `/settings/sso` (per-IdP: [Okta](./okta.md) ·
   [Entra](./entra.md) · [Google](./google-workspace.md)). In service mode the
   IdP's **ACS** is `<jackson-url>/api/oauth/saml`.

---

## <a id="remaining"></a>6. Remaining for GA

| Item | Type | Notes |
|---|---|---|
| Stand up Jackson service + verify live round-trip | **infra** | Path B above; the one true blocker for prod SSO |
| `prisma db push` on prod | **infra** | adds SSO tables + `metadataUrl`/`oidcDiscoveryUrl` cols + 2 health enums (additive; failures are isolated until done) |
| i18n the SSO admin UI | code | extract `/settings/sso` English strings into `en.ts` |
| k6 load test (100/500/1000 logins) | code+infra | script writable; running needs a live env |
| Surface SSO in **customer** docs | code | only at GA — until then it's repo-docs-only (no "available" claim) |
| Flip pricing `sso` → available | decision | **only** after a real-IdP round-trip passes |

---

## <a id="map"></a>7. File map

**Code** (`src/lib/sso/`): `backend.ts` (seam) · `backend-embedded.ts` (dev) ·
`backend-service.ts` (prod) · `resolve.ts` (email→tenant + enforcement lookup) ·
`routing.ts`/`guards.ts`/`provision.ts`/`verified-domains.ts` (pure, tested) ·
`provision-execute.ts` (JIT) · `enforcement.ts` · `cert-health.ts` + `health.ts`
(monitoring/self-heal) · `admin-guard.ts` · `audit.ts`.
Routes: `src/app/api/auth/sso/*` (login bridge), `src/app/api/sso/*` (admin),
`src/app/api/cron/sso-health`. UI: `src/app/settings/sso/`. Auth wiring:
`src/lib/auth/config.ts`. Cert/enforcement/etc. consume `prisma/schema.prisma`
models `SSOConnection`/`SsoDomain`/`VerifiedDomain`/`SsoRoleMapping`/`SsoAttributeMapping`/`SsoConnectionAudit`.

**Docs** (`docs/sso/`): this file · [README.md](./README.md) (SP values + concepts)
· [service-backend.md](./service-backend.md) (prod runbook) · [okta](./okta.md) ·
[entra](./entra.md) · [google-workspace](./google-workspace.md) ·
[troubleshooting](./troubleshooting.md). Local test: [../SSO_TESTING.md](../SSO_TESTING.md).
Architecture review: `docs/architecture/SSO_REVIEW.md`. Deploy kit: `deploy/jackson/`.

---

## <a id="gotchas"></a>8. Gotchas worth remembering

- **`@boxyhq/saml-jackson` must stay a devDependency** — moving it to prod deps
  reintroduces high-severity vulns and fails the Security CI gate.
- **`User.sessionsRevokedAt` read is decoupled** in the JWT callback so a
  not-yet-migrated DB can't break RBAC platform-wide (revocation just stays inert).
- The two health columns are additive; an unmigrated DB makes the health sweep a
  **benign isolated no-op** (the run-schedules piggyback try/catch contains it) —
  it never affects normal auth or scans.
- CI traps when editing SSO files: the secret scanner flags DB-connection-string
  placeholders that embed credentials (use non-URI placeholders like
  `<your-db-url>`), and CodeQL flags unanchored URL regexes (parse with
  `new URL().hostname`).
- Enforcement: don't set a connection to **Required** until SSO is confirmed
  working for that domain — non-owners would be forced down the SSO path (owners /
  master admin / exempt service accounts always keep a password break-glass).
