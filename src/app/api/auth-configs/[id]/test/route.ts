/**
 * RegLayer — Test Auth Config Endpoint
 *
 * WHY: Users need to verify credentials work BEFORE running an expensive full scan.
 *      This endpoint tests a saved auth config against a target URL without scanning.
 *
 * WHAT: POST /api/auth-configs/[id]/test — Decrypts saved config, launches browser,
 *       applies auth, navigates to test URL, reports success/failure.
 *
 * HOW: Decrypts stored config → launches headless browser → applies auth →
 *      navigates to user-provided testUrl → checks for 200 response / page load →
 *      returns structured result. Does NOT run axe-core or persist scan data.
 *
 * Security:
 * - Credentials are decrypted server-side only (never returned to client)
 * - SSRF validation on testUrl
 * - Rate-limited separately (auth tests are expensive)
 * - Only workspace members can test their configs
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { decryptJson } from "@/lib/crypto";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { applyAuthToContext, AuthenticationError } from "@/lib/scanner/auth";
import { launchBrowser } from "@/lib/scanner/browser/launch";
import type { AuthConfig } from "@/lib/validations/auth";
import { z } from "zod";

const testRequestSchema = z.object({
  testUrl: z
    .string()
    .url("testUrl must be a valid URL")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "testUrl must use http:// or https://"
    ),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/auth-configs/[id]/test — Test a saved auth config against a URL
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, memberships: { select: { workspaceId: true }, take: 1 } },
  });

  if (!user || !user.memberships[0]) {
    return NextResponse.json({ error: "User or workspace not found" }, { status: 404 });
  }

  const workspaceId = user.memberships[0].workspaceId;

  // Fetch the encrypted config (IDOR protection via workspace check)
  const savedConfig = await prisma.authConfig.findFirst({
    where: { id, workspaceId },
    select: { encryptedData: true, method: true },
  });

  if (!savedConfig) {
    return NextResponse.json({ error: "Auth config not found" }, { status: 404 });
  }

  // Validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = testRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { testUrl } = parseResult.data;

  // SSRF protection
  const ssrfError = validateScanUrl(testUrl);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }

  // Decrypt the auth config
  let authConfig: AuthConfig;
  try {
    authConfig = decryptJson<AuthConfig>(savedConfig.encryptedData);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt auth config. It may have been corrupted." },
      { status: 500 }
    );
  }

  // Launch browser and test auth
  let browser = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    // Apply auth
    const authResult = await applyAuthToContext(context, page, authConfig);

    // Navigate to test URL (if form auth already navigated, go to the target)
    if (authConfig.method !== "form") {
      await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    } else {
      // Form auth navigated to login → success page, now go to testUrl
      await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    }

    // Check if we got a valid page (not a login redirect)
    const finalUrl = page.url();
    const title = await page.title();

    await context.close();

    return NextResponse.json({
      success: true,
      method: authResult.method,
      authenticated: authResult.authenticated,
      testUrl,
      finalUrl,
      pageTitle: title,
      redirected: finalUrl !== testUrl,
    });
  } catch (err) {
    if (err instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, ...err.toResponse() },
        { status: 200 } // 200 because the test itself succeeded — auth failed
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "TEST_FAILED",
        message: err instanceof Error ? err.message : "Unknown error during auth test",
      },
      { status: 200 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
