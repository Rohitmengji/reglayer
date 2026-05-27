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
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/database/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
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
      async authorize(credentials) {
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
    async signIn({ user, account }) {
      // Ensure user exists in the database
      if (user?.email) {
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name || undefined, image: user.image || undefined },
          create: { email: user.email, name: user.name || null, image: user.image || null },
        });

        // Early access: auto-add first 100 users to default workspace until July 31, 2026
        const EARLY_ACCESS_DEADLINE = new Date("2026-07-31T23:59:59Z");
        const EARLY_ACCESS_LIMIT = 100;

        if (new Date() <= EARLY_ACCESS_DEADLINE) {
          const existingMembership = await prisma.workspaceMember.findFirst({
            where: { userId: dbUser.id },
          });

          if (!existingMembership) {
            // Check total workspace members to enforce 100-user cap
            const defaultWorkspace = await prisma.workspace.findFirst({
              orderBy: { createdAt: "asc" },
            });

            if (defaultWorkspace) {
              const memberCount = await prisma.workspaceMember.count({
                where: { workspaceId: defaultWorkspace.id },
              });

              if (memberCount < EARLY_ACCESS_LIMIT) {
                await prisma.workspaceMember.create({
                  data: {
                    userId: dbUser.id,
                    workspaceId: defaultWorkspace.id,
                    role: "MEMBER",
                  },
                });
                // Set plan to FREE for auto-added users
                await prisma.user.update({
                  where: { id: dbUser.id },
                  data: { plan: "FREE" },
                });
              }
            }
          }
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as unknown as { role: string }).role;
      }
      // Refresh isMasterAdmin from DB (non-blocking)
      if (token.email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email as string },
            select: { isMasterAdmin: true },
          });
          token.isMasterAdmin = dbUser?.isMasterAdmin ?? false;
        } catch {
          token.isMasterAdmin = token.isMasterAdmin ?? false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as unknown as { role: string }).role = token.role as string;
        (session.user as unknown as { isMasterAdmin: boolean }).isMasterAdmin = token.isMasterAdmin as boolean;
      }
      return session;
    },
  },
  secret: (() => {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret && process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET must be set in production");
    }
    return secret || "reglayer-dev-secret-local-only";
  })(),
};
