# Running SSO in production — the standalone Jackson service

Local dev runs SSO with the **embedded** engine (`@boxyhq/saml-jackson`, a
devDependency). Production can't: that package's dependency tree carries
high-severity vulnerabilities we refuse to ship (`npm audit --omit=dev
--audit-level=high`). So production runs Jackson as its **own container** and the
app talks to it over HTTPS — `SSO_BACKEND=service`. The app code is identical
either way; only the backend behind the `SsoBackend` seam changes.

## 0. Quickstart for THIS stack (Vercel app + Neon DB)

The app runs on **Vercel (serverless)**, which **cannot host the long-running
Jackson container** — so Jackson has to live somewhere else. Pick one:

- **Fastest — [BoxyHQ Cloud](https://boxyhq.com) (hosted Jackson).** No container
  to run: sign up, create a tenant/product, grab the base URL + an API key, and
  skip to step 2. Recommended unless you want to self-host.
- **Self-host the container** on a platform that runs Docker (Render / Railway /
  Fly.io / a small VPS) using `deploy/jackson/docker-compose.yml`. Not Vercel.

**Give Jackson its OWN database** — a separate **Neon database or branch**, *not*
the app's `neondb`. (Your dev and prod already share one Neon DB; don't also pile
Jackson's `jackson_*` tables onto it.) Point `JACKSON_DB_URL` there.

End to end:
1. Stand up Jackson (hosted or container) at an HTTPS URL; set its
   `SAML_AUDIENCE` to exactly `https://saml.reglayer.dev` (the SP Entity ID).
2. In Vercel → Project → Settings → Environment Variables (Production), add
   `SSO_ENABLED=true`, `SSO_BACKEND=service`, `SSO_JACKSON_URL=<jackson https url>`,
   `SSO_JACKSON_API_KEY=<jackson api key>`. Redeploy.
3. `npx prisma db push` against the **app's** Neon DB (additive; one time).
4. Smoke-test (step 4 below). Expect `✅ PASS`.
5. Configure a connection in `/settings/sso` (per-IdP guides linked below).

Detailed reference for each step follows.

## 1. Deploy Jackson

Manifest: [`deploy/jackson/docker-compose.yml`](../../deploy/jackson/docker-compose.yml),
env template: [`deploy/jackson/.env.example`](../../deploy/jackson/.env.example).

```bash
cp deploy/jackson/.env.example deploy/jackson/.env   # fill it in
docker compose -f deploy/jackson/docker-compose.yml --env-file deploy/jackson/.env up -d
```

Put it behind HTTPS at a stable host (e.g. `https://sso.yourdomain.com`) and set
that as `JACKSON_EXTERNAL_URL`. **`SAML_AUDIENCE` must exactly match** the SP
Entity ID in [README.md](./README.md) (`https://saml.reglayer.dev` unless you
override it). Pin the image to a specific tag. (Or use BoxyHQ's hosted Jackson —
same REST API; just point the env below at it.)

## 2. Point RegLayer at it (Vercel env)

```
SSO_ENABLED=true
SSO_BACKEND=service
SSO_JACKSON_URL=https://sso.yourdomain.com     # = JACKSON_EXTERNAL_URL
SSO_JACKSON_API_KEY=<the JACKSON_API_KEY you set>
```

## 3. Migrate the app database

The SSO tables + the `metadataUrl`/`oidcDiscoveryUrl` columns + the
`INVALID_METADATA`/`VALIDATION_FAILED` health enums are additive. Apply them to
the app's Postgres:

```bash
npx prisma db push
```

(Until this runs, the SSO admin pages and the health sweep fail *in isolation* —
they don't affect normal auth — but you can't configure connections.)

## 4. Smoke-test the wiring

Verifies our `JacksonServiceBackend` against the live Jackson end-to-end (creates
a throwaway mocksaml connection, gets an authorize redirect, deletes it):

```bash
SSO_BACKEND=service \
SSO_JACKSON_URL=https://sso.yourdomain.com \
SSO_JACKSON_API_KEY=<key> \
NEXTAUTH_URL=https://app.yourdomain.com \
npx tsx scripts/smoke-sso-service.ts
```

Expect `✅ PASS`. A failure here means the URL/API key or the Jackson deployment
is wrong — fix before configuring real connections.

## 5. Configure a connection

In the app: **/settings/sso → Add connection**, verify a domain, raise the
rollout stage. Per-IdP steps: [Okta](./okta.md) · [Entra](./entra.md) ·
[Google Workspace](./google-workspace.md). In service mode the IdP's **ACS** is
the Jackson host's `https://sso.yourdomain.com/api/oauth/saml` (not the app's) —
everything else matches the per-IdP guides.

## Notes
- Scale/HA: run multiple Jackson replicas behind the load balancer; it's
  stateless apart from its database.
- Only flip pricing `sso` → available after a real-IdP round-trip succeeds here.
