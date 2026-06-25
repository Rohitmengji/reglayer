# Google Workspace → RegLayer (SAML 2.0)

Connect Google Workspace as a SAML IdP. You need a Google Workspace super admin +
RegLayer Owner/Admin. Replace `<app>` with your RegLayer origin.

## 1. Create the custom SAML app

1. Google Admin console → **Apps → Web and mobile apps → Add app → Add custom
   SAML app**.
2. Name it "RegLayer" → Continue.
3. On **Google IdP details**, click **Download metadata** (you'll paste this into
   RegLayer in step 3) → Continue.

## 2. Service provider details

| Google field | Value |
|---|---|
| **ACS URL** | `https://<app>/api/auth/sso/acs` |
| **Entity ID** | `https://saml.reglayer.dev` |
| **Name ID format** | EMAIL |
| **Name ID** | Basic Information → Primary email |

## 3. Attribute mapping

Add these mappings (Google directory field → App attribute):

| Google directory field | App attribute |
|---|---|
| Primary email | `email` |
| First name | `firstName` |
| Last name | `lastName` |

Google Workspace SAML does **not** emit group membership by default — if you need
group→role mapping, prefer Okta/Entra, or assign roles via the connection default
role + manual promotion. Finish the wizard.

## 4. Get metadata into RegLayer

RegLayer → **/settings/sso → Add connection → SAML** → paste the metadata XML you
downloaded in step 1 (Google gives a file, not a stable URL) → set default role →
**Create**.

## 5. Turn it on + verify domain + roll out

1. In Google Admin, set the app's **User access** to ON for the right org units.
2. RegLayer: add your domain, publish the `reglayer-verification=<token>` DNS TXT
   record, **Verify**, then raise the rollout stage above Disabled.

## 6. Test

Sign out → `/auth/login` → a user's Workspace email → **Continue with SSO**.
Google enforces a short propagation delay after enabling the app — if the first
attempt fails, wait a few minutes. More help: [troubleshooting](./troubleshooting.md).
