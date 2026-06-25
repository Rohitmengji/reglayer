# Okta → RegLayer (SAML 2.0)

Connect Okta as a SAML IdP. You need Okta admin + RegLayer workspace
Owner/Admin. Replace `<app>` with your RegLayer origin (e.g. `https://app.reglayer.com`).

## 1. Create the Okta app

1. Okta Admin → **Applications → Create App Integration**.
2. Choose **SAML 2.0** → Next.
3. Name it "RegLayer" → Next.

## 2. Configure SAML settings

| Okta field | Value |
|---|---|
| **Single sign-on URL** (ACS) | `https://<app>/api/auth/sso/acs` |
| **Use this for Recipient URL and Destination URL** | ✅ checked |
| **Audience URI (SP Entity ID)** | `https://saml.reglayer.dev` |
| **Name ID format** | EmailAddress |
| **Application username** | Email |

**Attribute Statements** (Name → Value):

| Name | Value |
|---|---|
| `email` | `user.email` |
| `firstName` | `user.firstName` |
| `lastName` | `user.lastName` |

**Group Attribute Statement** (only if you'll use role mappings):

| Name | Filter |
|---|---|
| `groups` | Matches regex `.*` (or "Starts with" your RegLayer group prefix) |

Finish the wizard ("I'm an Okta customer adding an internal app").

## 3. Get the metadata into RegLayer

1. In the Okta app → **Sign On** tab → copy the **Metadata URL**
   (or download the metadata XML).
2. In RegLayer → **/settings/sso → Add connection → SAML** → paste the metadata
   URL (or XML). Set the default role (e.g. Member). **Create**.

## 4. Assign users + verify the domain

1. In Okta → **Assignments** → assign the people/groups who should have access.
2. In RegLayer, add your email domain to the connection and publish the shown
   `reglayer-verification=<token>` DNS **TXT** record, then **Verify**.
3. Raise the connection's **rollout stage** above Disabled.

## 5. (Optional) Map Okta groups to roles

In the connection's **Role mappings**, add e.g. `okta-reglayer-admins → Admin`.
The group name must match what Okta asserts in the `groups` claim (case-insensitive).

## 6. Test

Sign out → `/auth/login` → enter an assigned user's email → **Continue with SSO**
→ you should land in Okta and back, provisioned into the workspace. If not, see
[troubleshooting](./troubleshooting.md).
