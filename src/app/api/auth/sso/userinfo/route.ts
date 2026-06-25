/**
 * GET /api/auth/sso/userinfo — NextAuth → Jackson profile lookup.
 *
 * NextAuth calls this with `Authorization: Bearer <access_token>`. We return the
 * IdP profile plus the `requested` params Jackson echoes back — the provider's
 * profile() reads `requested.tenant` (the server-resolved connection id) so JIT
 * provisioning knows which workspace to provision into.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSsoBackend } from "@/lib/sso/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  try {
    const backend = await getSsoBackend();
    const info = await backend.userInfo(token);
    return NextResponse.json({
      id: info.id,
      email: info.email,
      name: info.name ?? null,
      groups: info.groups ?? [],
      requested: info.requested,
    });
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}
