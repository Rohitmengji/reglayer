# Testing Enterprise SSO in a browser

This walks through exercising the full multi-tenant SAML login flow end-to-end
against **mocksaml.com** (a free hosted test IdP). Read this fully — there is one
hard environment constraint.

## ⚠️ Where SSO actually runs

The SSO transport uses **BoxyHQ Jackson**. There are two backends behind one seam
(`src/lib/sso/backend.ts`):

- **`embedded`** (default) — Jackson runs in-process. `@boxyhq/saml-jackson` is a
  **devDependency**, so it exists in **local dev / CI only**, NOT in a production
  build (its dependency tree carries high-severity vulns we refuse to ship —
  `npm audit --omit=dev --audit-level=high`).
- **`service`** — an HTTP client to a **standalone** Jackson container
  (`SSO_BACKEND=service` + `SSO_JACKSON_URL` + `SSO_JACKSON_API_KEY`). This is the
  production path; it keeps that dependency tree out of our app.

**Therefore: browser-test SSO in local `npm run dev` (embedded).** To test on a
deployed/preview env you must first stand up a standalone Jackson and point
`SSO_BACKEND=service` at it. Pricing stays "coming soon" until that real-IdP
round-trip is verified.

## One-time setup (local dev)

1. **Apply the schema** (additive — adds the SSO tables + `User.sessionsRevokedAt`):
   ```bash
   npx prisma db push
   ```
2. **Enable the SSO provider** in `.env.local`:
   ```bash
   SSO_ENABLED=true
   # NEXTAUTH_URL must match your dev origin (default http://localhost:3000)
   ```
3. **Make your workspace ENTERPRISE** (SSO is Enterprise-gated). As the master
   admin, `POST /api/admin` `{ action: "changePlan", workspaceId, plan: "ENTERPRISE" }`,
   or set `Workspace.plan = ENTERPRISE` directly.
4. `npm run dev`

## Configure a connection (UI)

1. Sign in as an **OWNER/ADMIN** of the Enterprise workspace → go to **`/settings/sso`**.
2. **Add connection** → protocol **SAML 2.0** → name it → for metadata, paste the
   metadata URL `https://mocksaml.com/api/saml/metadata` into the **metadata URL**
   field (or paste the XML). Default role: Member. **Create**.
3. **Add a domain** on the new connection card. The flow shows a DNS `TXT` record.
   You now need that domain **VERIFIED** (only verified domains route logins) —
   two ways:
   - **Real:** use a domain you control, publish the shown TXT record
     (`reglayer-verification=<token>`), then click **Verify**.
   - **Dev shortcut (no DNS):** mark it verified directly, e.g.
     ```bash
     # replace the ids/domain; connectionId + workspaceId are on the connection
     npx prisma db execute --stdin <<'SQL'
     UPDATE sso_domains SET "verificationStatus"='VERIFIED', "verifiedAt"=now() WHERE domain='acme.test';
     INSERT INTO sso_verified_domains (id, domain, "workspaceId", "connectionId", "verifiedAt")
       SELECT gen_random_uuid()::text, domain, "workspaceId", "connectionId", now() FROM sso_domains WHERE domain='acme.test';
     SQL
     ```
4. On the connection card, raise the **rollout stage** above `Disabled` (e.g. `GA`).

## Walk the login

1. Sign out. Go to **`/auth/login`**.
2. Enter an email **at the verified domain** (e.g. `tester@acme.test`) and click
   **Continue with SSO**.
3. You're redirected to mocksaml → enter that same email + any name → submit.
4. mocksaml posts the assertion to `/api/auth/sso/acs` → you land back signed in,
   JIT-provisioned into the Enterprise workspace at the connection's default role
   (or the role mapped from your IdP group, if you configured role mappings).

## Notes
- IdP **group → role** mappings: edit them on the connection card (collapsible
  "Role mappings"). mocksaml can assert a `groups` claim; matching is
  case-insensitive. SSO never grants OWNER.
- **OIDC** works the same way (choose OIDC, provide discovery URL + client
  id/secret); the IdP redirects to `/api/auth/sso/oidc`.
- If `/settings/sso` shows "couldn't load", the schema isn't pushed (step 1) or
  you're not an Enterprise OWNER/ADMIN.
