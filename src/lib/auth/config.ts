/**
 * ---------------------------------------------------------
 * RegLayer — Authentication Configuration
 * ---------------------------------------------------------
 *
 * Purpose:
 * NextAuth.js configuration for user authentication.
 *
 * Why this exists:
 * Enterprise compliance tools require:
 * - User identity for audit trails
 * - Role-based access control
 * - Session management
 *
 * V1: Credentials provider (email/password)
 * Future: OAuth (Google, GitHub, SAML for enterprise)
 *
 * Engineering Notes:
 * - Uses JWT strategy (stateless, no DB required for V1)
 * - Easily extensible with additional providers
 * - Session data available on both client and server
 * ---------------------------------------------------------
 */

import type { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/database/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { cacheGet, cacheSet } from "@/lib/cache/redis";
import { isSessionRevoked } from "@/lib/sso/guards";
import { applyProvisioning } from "@/lib/sso/provision-execute";

/**
 * Enterprise SSO provider (BoxyHQ Jackson, bridged via /api/auth/sso/*).
 *
 * Gated behind SSO_ENABLED so the whole auth path stays OFF until ops flips it
 * after a real-IdP round-trip (review #38 — feature-flagged for safe rollback;
 * pricing stays "coming soon" until then). The tenant is resolved SERVER-side in
 * the authorize bridge from the verified domain — `login_hint` is the only thing
 * the client supplies (review #14).
 */
interface BoxyHqProfile {
  id: string;
  email: string;
  name?: string | null;
  groups?: string[];
  requested?: Record<string, string>;
}

function boxyhqSsoProvider(): OAuthConfig<BoxyHqProfile> {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return {
    id: "boxyhq-saml",
    name: "Enterprise SSO",
    type: "oauth",
    version: "2.0",
    checks: ["pkce", "state"],
    authorization: { url: `${baseUrl}/api/auth/sso/authorize`, params: { scope: "" } },
    token: `${baseUrl}/api/auth/sso/token`,
    userinfo: `${baseUrl}/api/auth/sso/userinfo`,
    clientId: "dummy",
    clientSecret: "dummy",
    profile(profile) {
      return { id: profile.id, email: profile.email, name: profile.name ?? null };
    },
  };
}

/**
 * Login attempts per IP+email per 5 minutes. Deliberately generous — it only
 * exists to stop credential-stuffing/brute-force, never a legitimate user
 * retrying a password (register/forgot-password use the stricter auth tier).
 */
const LOGIN_RATE_LIMIT = { limit: 30, windowSec: 300 };

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.SSO_ENABLED === "true" ? [boxyhqSsoProvider()] : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@reglayer.dev" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        // Brute-force guard — the credentials callback is a public path that
        // bypasses the proxy's global API rate limit
        const ip =
          (Array.isArray(req?.headers?.["x-forwarded-for"])
            ? req.headers["x-forwarded-for"][0]
            : req?.headers?.["x-forwarded-for"])?.split(",")[0]?.trim() ||
          "anonymous";
        const rl = await rateLimit(
          `login:${ip}:${credentials?.email ?? "unknown"}`,
          LOGIN_RATE_LIMIT,
          "login"
        );
        if (!rl.success) return null;

        // Dev seed accounts — credentials from env vars (NOT hardcoded)
        const masterEmail = process.env.SEED_MASTER_EMAIL;
        const masterPass = process.env.SEED_MASTER_PASSWORD;
        const adminEmail = process.env.SEED_ADMIN_EMAIL;
        const adminPass = process.env.SEED_ADMIN_PASSWORD;

        if (
          masterEmail && masterPass &&
          credentials?.email === masterEmail &&
          credentials?.password === masterPass
        ) {
          return {
            id: "master-1",
            name: "Master Admin",
            email: masterEmail,
            role: "master",
          };
        }
        if (
          adminEmail && adminPass &&
          credentials?.email === adminEmail &&
          credentials?.password === adminPass
        ) {
          return {
            id: "1",
            name: "Admin",
            email: adminEmail,
            role: "admin",
          };
        }

        // Check database passwordHash for any user
        if (credentials?.email && credentials?.password) {
          const dbUser = await prisma.user.findUnique({
            where: { email: credentials.email },
            select: { id: true, name: true, email: true, passwordHash: true },
          });
          if (dbUser?.passwordHash) {
            const valid = await bcrypt.compare(credentials.password, dbUser.passwordHash);
            if (valid) {
              return { id: dbUser.id, name: dbUser.name || dbUser.email.split("@")[0], email: dbUser.email };
            }
          }
        }

        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Ensure user exists in the database
      if (user?.email) {
        try {
          const dbUser = await prisma.user.upsert({
            where: { email: user.email },
            update: { name: user.name || undefined, image: user.image || undefined },
            create: { email: user.email, name: user.name || null, image: user.image || null },
          });

          // Enterprise SSO JIT provisioning (review #4/#5/#15). The tenant
          // (= SSOConnection.id) is carried in the userinfo `requested.tenant`
          // Jackson echoes back — never trusted from the client. Failure never
          // blocks sign-in (additive v1, #20): authz is re-validated everywhere
          // (#35), so an unprovisioned SSO user simply has no workspace access.
          if (account?.provider === "boxyhq-saml") {
            const p = profile as BoxyHqProfile | undefined;
            const tenant = p?.requested?.tenant;
            if (tenant) {
              try {
                await applyProvisioning({
                  connectionId: tenant,
                  email: user.email,
                  name: user.name ?? null,
                  groups: p?.groups ?? [],
                });
              } catch {
                // Provisioning failures must not lock a user out of authentication.
              }
            }
          }

          // Early access: auto-add first 100 users to default workspace until July 31, 2026
          const EARLY_ACCESS_DEADLINE = new Date("2026-07-31T23:59:59Z");
          const EARLY_ACCESS_LIMIT = 100;

          if (new Date() <= EARLY_ACCESS_DEADLINE) {
            const existingMembership = await prisma.workspaceMember.findFirst({
              where: { userId: dbUser.id },
            });

            if (!existingMembership) {
              const defaultWorkspace = await prisma.workspace.findFirst({
                orderBy: { createdAt: "asc" },
              });

              if (defaultWorkspace) {
                const memberCount = await prisma.workspaceMember.count({
                  where: { workspaceId: defaultWorkspace.id },
                });

                if (memberCount < EARLY_ACCESS_LIMIT) {
                  // Use upsert to prevent race condition on concurrent signups
                  await prisma.workspaceMember.upsert({
                    where: {
                      userId_workspaceId: {
                        userId: dbUser.id,
                        workspaceId: defaultWorkspace.id,
                      },
                    },
                    update: {},
                    create: {
                      userId: dbUser.id,
                      workspaceId: defaultWorkspace.id,
                      role: "MEMBER",
                    },
                  });
                  await prisma.user.update({
                    where: { id: dbUser.id },
                    data: { plan: "FREE" },
                  });
                }
              }
            }
          }
        } catch {
          // Auth should not fail due to workspace provisioning errors.
          // User can still sign in; workspace membership can be retried later.
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      // Cache the auth context (isMasterAdmin + primary workspace role) in Redis
      // (60s TTL) to avoid a DB hit on every request. workspaceRole is the user's
      // REAL WorkspaceMember role — the canonical RBAC signal for the client UI
      // (the legacy `role` string was only ever set for seeded accounts).
      if (token.email) {
        const cacheKey = `auth:ctx:${token.email}`;
        const cached = await cacheGet<{ isMasterAdmin: boolean; workspaceRole: string | null; revokedAtSec: number | null }>(cacheKey);
        let revokedAtSec: number | null = null;
        if (cached) {
          token.isMasterAdmin = cached.isMasterAdmin;
          token.workspaceRole = cached.workspaceRole;
          revokedAtSec = cached.revokedAtSec ?? null;
        } else {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email: token.email },
              select: {
                isMasterAdmin: true,
                sessionsRevokedAt: true,
                memberships: { select: { role: true }, orderBy: { joinedAt: "asc" }, take: 1 },
              },
            });
            token.isMasterAdmin = dbUser?.isMasterAdmin ?? false;
            token.workspaceRole = dbUser?.memberships?.[0]?.role ?? null;
            revokedAtSec = dbUser?.sessionsRevokedAt ? Math.floor(dbUser.sessionsRevokedAt.getTime() / 1000) : null;
            await cacheSet(cacheKey, { isMasterAdmin: token.isMasterAdmin, workspaceRole: token.workspaceRole, revokedAtSec }, 60);
          } catch {
            token.isMasterAdmin = token.isMasterAdmin ?? false;
            token.workspaceRole = token.workspaceRole ?? null;
          }
        }
        // Session revocation (review #1): a token issued before the user's
        // sessionsRevokedAt immediately loses elevated context. Defaults to
        // not-revoked (revokedAtSec=null) so normal users and lookup errors are
        // never affected. Full hard sign-out wants Auth.js v5 DB sessions
        // (review #11) — tracked follow-up.
        const iat = (token as { iat?: number }).iat;
        if (isSessionRevoked(typeof iat === "number" ? iat : undefined, revokedAtSec)) {
          token.isMasterAdmin = false;
          token.workspaceRole = null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.isMasterAdmin = token.isMasterAdmin ?? false;
        session.user.workspaceRole = (token.workspaceRole as string | null) ?? null;
      }
      return session;
    },
  },
  secret: (() => {
    const secret = process.env.NEXTAUTH_SECRET;
    // NODE_ENV is already "production" during `next build` page-data collection,
    // but the runtime secret is injected by the host (Vercel) at REQUEST time,
    // not at build time. Throwing here crashes the build ("Failed to collect
    // page data") even though the deployed function will have the secret. Only
    // enforce at actual runtime — never during the production build phase.
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    if (!secret && process.env.NODE_ENV === "production" && !isBuildPhase) {
      throw new Error("NEXTAUTH_SECRET must be set in production");
    }
    return secret || "reglayer-dev-secret-local-only";
  })(),
};
