/**
 * GET /api/auth/sso/authorize — NextAuth → Jackson authorization bridge.
 *
 * NextAuth redirects here (it's the `boxyhq-saml` provider's authorization URL)
 * with state/redirect_uri/PKCE + a `login_hint` (the email). We resolve the
 * tenant SERVER-side from the email's verified domain (review #14 — tenant is
 * never trusted from the client), then hand Jackson the authorize request and
 * redirect the browser to the customer's IdP.
 *
 * Open-redirect safety: `redirect_uri` is forwarded as-is, but Jackson rejects
 * any redirect_uri not registered on the connection, so a forged value can't
 * leak the OAuth code.
 */
import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { getSsoBackend } from "@/lib/sso/backend";
import { resolveTenantForEmail } from "@/lib/sso/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginError(origin: string, code: string): NextResponse {
  return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(code)}`, 303);
}

export async function GET(request: NextRequest) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  const origin = request.nextUrl.origin;
  const sp = request.nextUrl.searchParams;
  const email = (sp.get("login_hint") ?? "").trim();
  const state = sp.get("state") ?? "";
  const redirectUri = sp.get("redirect_uri") ?? "";
  if (!state || !redirectUri || !email) return loginError(origin, "sso_invalid_request");

  const resolved = await resolveTenantForEmail(email);
  if (!resolved) return loginError(origin, "sso_not_available");

  try {
    const backend = await getSsoBackend();
    const url = await backend.authorizeUrl({
      tenant: resolved.tenant,
      product: resolved.product,
      state,
      redirectUri,
      codeChallenge: sp.get("code_challenge") ?? undefined,
      codeChallengeMethod: sp.get("code_challenge_method") ?? undefined,
      scope: sp.get("scope") ?? undefined,
      nonce: sp.get("nonce") ?? undefined,
      loginHint: email,
    });
    return NextResponse.redirect(url, 303);
  } catch {
    return loginError(origin, "sso_error");
  }
}
