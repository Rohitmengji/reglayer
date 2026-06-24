/**
 * GET /api/auth/sso/oidc — OIDC IdP authorization-response callback.
 *
 * For OIDC connections, the customer's IdP redirects here with code/state.
 * Jackson exchanges it and returns the app redirect carrying our OAuth code
 * back to NextAuth's callback.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSsoBackend } from "@/lib/sso/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  try {
    const backend = await getSsoBackend();
    const { redirectUrl } = await backend.oidcResponse(query);
    return NextResponse.redirect(redirectUrl, 303);
  } catch {
    return NextResponse.redirect(`${request.nextUrl.origin}/auth/login?error=sso_oidc_failed`, 303);
  }
}
