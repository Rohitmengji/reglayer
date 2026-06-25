# Enterprise SSO — admin setup

How an Enterprise workspace connects its identity provider (IdP) so its people
sign in to RegLayer with SAML 2.0 or OIDC. Per-IdP walkthroughs:

- [Okta](./okta.md)
- [Microsoft Entra ID (Azure AD)](./entra.md)
- [Google Workspace](./google-workspace.md)
- [Troubleshooting & recovery](./troubleshooting.md)

> **Status:** SSO is gated off by default (`SSO_ENABLED` + per-connection rollout
> stage). It runs in local dev (embedded engine) today; production requires the
> standalone Jackson service — see [SSO_TESTING.md](../SSO_TESTING.md). Don't flip
> pricing to "available" until a real-IdP round-trip is verified.

## Service-provider (SP) values to give your IdP

These identify RegLayer to your IdP. Replace `<app>` with your RegLayer origin
(e.g. `https://app.reglayer.com`).

| Field | Value |
|---|---|
| **SAML ACS / Reply URL** | `https://<app>/api/auth/sso/acs` |
| **SP Entity ID / Audience** | `https://saml.reglayer.dev` *(unless your deploy overrides `SAML_AUDIENCE`)* |
| **NameID format** | EmailAddress |
| **OIDC redirect URI** | `https://<app>/api/auth/sso/oidc` |

> Running the **standalone Jackson service** (`SSO_BACKEND=service`)? The ACS is the
> Jackson host's `https://<jackson-host>/api/oauth/saml` and the OIDC callback is
> `https://<jackson-host>/api/oauth/oidc` instead. Everything else is identical.

## Attributes / claims RegLayer uses

| Purpose | SAML attribute / OIDC claim | Required |
|---|---|---|
| Identity | NameID = **email address** | ✅ required |
| Display name | `firstName` + `lastName` (combined into the profile name) | recommended |
| Role mapping | a **groups** claim (group names) | optional |

RegLayer stores only the user's name today; other attributes (department, title…)
are accepted but not yet persisted. **Email is the identity** — the asserted
email's domain must be a **verified** domain on the connection (below), or the
user is authenticated but not provisioned into the workspace.

## The five setup steps (in `/settings/sso`)

1. **Add connection** — choose SAML or OIDC, paste the IdP metadata (URL or XML)
   for SAML, or discovery URL + client id/secret for OIDC. Pick a default role.
2. **Add a domain** — RegLayer shows a DNS `TXT` record:
   `reglayer-verification=<token>`. Publish it on the domain, then **Verify**.
   Only **verified** domains route logins (and a domain belongs to exactly one
   workspace).
3. **(Optional) Role mappings** — map IdP group names → workspace role
   (Admin / Member / Viewer; never Owner). Matching is **case-insensitive**.
4. **Raise the rollout stage** above `Disabled` (Internal / Beta / GA). Until
   then the connection routes nothing.
5. **(Optional) Enforcement** — set the connection to **Required** to block
   password/Google login for that domain. Workspace **Owners**, master admins,
   and exempt service accounts keep a non-SSO break-glass path, so an IdP outage
   can't lock the org out.

## How a login flows

`/auth/login` → user enters their work email → **Continue with SSO** → RegLayer
resolves the verified domain → redirects to your IdP → IdP posts the assertion to
the ACS → RegLayer just-in-time provisions the user into the workspace at their
mapped (or default) role.
