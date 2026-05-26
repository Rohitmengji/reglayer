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
        if (
          credentials?.email === "master@reglayer.dev" &&
          credentials?.password === "reglayer2024"
        ) {
          return {
            id: "master-1",
            name: "Master Admin",
            email: "master@reglayer.dev",
            role: "master",
          };
        }
        if (
          credentials?.email === "admin@reglayer.dev" &&
          credentials?.password === "reglayer2024"
        ) {
          return {
            id: "1",
            name: "Admin",
            email: "admin@reglayer.dev",
            role: "admin",
          };
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
    async signIn({ user }) {
      // Ensure user exists in the database
      if (user?.email) {
        await prisma.user.upsert({
          where: { email: user.email },
          update: { name: user.name || undefined, image: user.image || undefined },
          create: { email: user.email, name: user.name || null, image: user.image || null },
        });
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
  secret: process.env.NEXTAUTH_SECRET ?? "reglayer-dev-secret-change-in-production",
};
