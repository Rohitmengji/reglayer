/**
 * POST /api/auth/sso/token — NextAuth → Jackson OAuth token exchange.
 *
 * NextAuth posts the authorization code (form-encoded, with the PKCE verifier
 * when used). We forward to Jackson and return a minimal OAuth token response;
 * NextAuth only needs `access_token` to then call /userinfo.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSsoBackend } from "@/lib/sso/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const code = String(form.get("code") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const cv = form.get("code_verifier");
  const codeVerifier = cv ? String(cv) : undefined;
  if (!code || !redirectUri) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  try {
    const backend = await getSsoBackend();
    const { accessToken, expiresIn } = await backend.exchangeCode({ code, redirectUri, codeVerifier });
    return NextResponse.json({ access_token: accessToken, token_type: "bearer", expires_in: expiresIn });
  } catch {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
}
