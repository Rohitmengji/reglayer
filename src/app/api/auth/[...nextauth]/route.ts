/**
 * RegLayer — NextAuth Route Handler
 *
 * WHY: NextAuth.js requires a catch-all API route to handle OAuth callbacks, sessions, CSRF.
 * WHAT: Delegates all /api/auth/* requests to NextAuth's internal handler.
 * HOW: Exports GET and POST handlers from NextAuth(authOptions). Handles login, callback, signout.
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/config";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
