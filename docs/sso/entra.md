# Microsoft Entra ID (Azure AD) → RegLayer (SAML 2.0)

Connect Entra ID as a SAML IdP. You need Entra admin (Cloud Application
Administrator) + RegLayer Owner/Admin. Replace `<app>` with your RegLayer origin.

## 1. Create the enterprise application

1. Entra admin center → **Identity → Applications → Enterprise applications →
   New application → Create your own application**.
2. Name it "RegLayer", choose **Integrate any other application (Non-gallery)** →
   Create.
3. Open the app → **Single sign-on → SAML**.

## 2. Basic SAML configuration

| Entra field | Value |
|---|---|
| **Identifier (Entity ID)** | `https://saml.reglayer.dev` |
| **Reply URL (ACS)** | `https://<app>/api/auth/sso/acs` |
| **Sign on URL** | `https://<app>/auth/login` (optional) |

## 3. Attributes & Claims

Edit **Attributes & Claims** so the assertion sends:

| Claim name | Source attribute |
|---|---|
| **Unique User Identifier (Name ID)** | `user.mail` (format: Email address) |
| `firstName` | `user.givenname` |
| `lastName` | `user.surname` |
| `email` | `user.mail` |

For role mapping, add a **group claim** (Add a group claim → Security groups or
Groups assigned to the application → emit **Group names** if you want readable
names that match your RegLayer role mappings; otherwise Entra emits group object
IDs and your mappings must use those IDs).

## 4. Get metadata into RegLayer

1. In the SAML SSO page → **SAML Certificates** → copy the **App Federation
   Metadata Url** (or download **Federation Metadata XML**).
2. RegLayer → **/settings/sso → Add connection → SAML** → paste the metadata URL
   (or XML) → set default role → **Create**.

## 5. Assign users + verify domain + roll out

1. Entra app → **Users and groups** → assign who gets access.
2. RegLayer: add your domain, publish the `reglayer-verification=<token>` DNS TXT
   record, **Verify**, then raise the rollout stage above Disabled.

## 6. (Optional) Group → role mappings

Add mappings in the connection (e.g. `RegLayer-Admins → Admin`). The value must
match what Entra emits in the groups claim (names **or** object IDs, depending on
step 3). Matching is case-insensitive.

## 7. Test

Sign out → `/auth/login` → assigned user's email → **Continue with SSO**. Issues?
See [troubleshooting](./troubleshooting.md) (Entra's "AADSTS" errors usually mean
the Reply URL or Identifier don't exactly match the values above).
