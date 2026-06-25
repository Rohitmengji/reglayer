/**
 * POST /api/auth/sso/acs — SAML Assertion Consumer Service.
 *
 * The customer's IdP POSTs the signed SAMLResponse here. Jackson validates the
 * assertion (signature + replay protection) and returns the app redirect that
 * carries the OAuth code back to NextAuth's callback. 303 so the browser GETs
 * the callback.
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
    return new NextResponse("Invalid SAML response", { status: 400 });
  }
  const SAMLResponse = String(form.get("SAMLResponse") ?? "");
  const RelayState = String(form.get("RelayState") ?? "");
  if (!SAMLResponse) return new NextResponse("Missing SAMLResponse", { status: 400 });

  try {
    const backend = await getSsoBackend();
    const { redirectUrl } = await backend.samlResponse({ SAMLResponse, RelayState });
    return NextResponse.redirect(redirectUrl, 303);
  } catch {
    return NextResponse.redirect(`${request.nextUrl.origin}/auth/login?error=sso_assertion_failed`, 303);
  }
}
