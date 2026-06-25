# SSO troubleshooting & recovery

Symptoms → causes → fixes. Replace `<app>` with your RegLayer origin.

## "Continue with SSO" says SSO isn't set up for this email
- The email's domain isn't a **verified** domain on any live connection. Add +
  verify the domain (DNS TXT `reglayer-verification=<token>`) and raise the
  rollout stage above `Disabled`.
- The domain is a **public/freemail** domain (gmail.com, outlook.com…). These are
  never routable for SSO by design.
- SSO isn't enabled on the deployment (`SSO_ENABLED` unset) — see
  [SSO_TESTING.md](../SSO_TESTING.md).

## The button does nothing / a server error on the login page
- The SSO database tables aren't migrated on this environment. Run
  `prisma db push`. (The discovery endpoint degrades to "not available" rather
  than erroring, so you'll see the "not set up" message until migrated.)

## Login bounces to the IdP and back, but I land on the login page
- **Domain not verified for the asserted email.** Provisioning requires the
  asserted email's domain to be a verified domain of the connection. Verify it.
- **ACS / Entity ID mismatch.** The IdP must use exactly
  `https://<app>/api/auth/sso/acs` (ACS) and `https://saml.reglayer.dev`
  (Audience/Entity ID). A trailing slash or wrong host fails silently.
- **Clock skew / assertion expiry.** Ensure the IdP and server clocks are sane.

## Users get the default role instead of their mapped role
- The IdP isn't sending a **groups** claim, or the group names don't match your
  role mappings. Matching is case-insensitive but the names must otherwise match.
  Confirm the IdP emits group **names** (not opaque IDs) — or set your RegLayer
  mappings to the IDs the IdP actually sends (common with Entra).
- Role mappings never grant **Owner**, and SSO never **downgrades** an existing
  higher role — both are intentional.

## "Your organization requires single sign-on" on password login
- The connection's enforcement is set to **Required**. Use **Continue with SSO**.
- Locked out because SSO is broken? **Break-glass:** a workspace **Owner** (and
  platform master admin, and any exempt service account) can still sign in with
  password/Google. Sign in as an Owner and set the connection back to
  **Optional** in `/settings/sso`. Every break-glass login is logged.

## Certificate expiry
- The connection card shows the IdP cert expiry date; `healthStatus` flips to
  **WARNING** then **EXPIRED_CERT**, and Owners/Admins are emailed at 90/60/30/
  14/7/1 days (requires SMTP configured + the daily health cron).
- An expired cert stops SSO. Re-export fresh metadata from the IdP and re-create
  / update the connection.

## Domain says "taken_by_other"
- A verified domain belongs to exactly one workspace globally. If another
  workspace verified it, that must be released first (support workflow).

## Where to look
- Server logs: `SSO enforcement…`, `SSO break-glass…`, `SSO health checks…`,
  `SSO connection registration failed…`.
- Connection audit trail (`SsoConnectionAudit`): created/updated/deleted, domain
  verified, role-mapping changed — who/when/before→after.
