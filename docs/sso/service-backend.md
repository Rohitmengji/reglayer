# Running SSO in production — the standalone Jackson service

Local dev runs SSO with the **embedded** engine (`@boxyhq/saml-jackson`, a
devDependency). Production can't: that package's dependency tree carries
high-severity vulnerabilities we refuse to ship (`npm audit --omit=dev
--audit-level=high`). So production runs Jackson as its **own container** and the
app talks to it over HTTPS — `SSO_BACKEND=service`. The app code is identical
either way; only the backend behind the `SsoBackend` seam changes.

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
