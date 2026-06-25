"use client";

/**
 * RegLayer — Login Page
 *
 * WHY: Authentication gateway. Users must sign in to use the platform.
 * WHAT: Google OAuth button + email/password form. Links to request-access for new users.
 * HOW: Uses next-auth signIn() for both providers. Redirects to /dashboard on success.
 */

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  // Enterprise SSO: only offered when the email's domain is a VERIFIED, active
  // SSO domain (server decides — discovery returns a bare boolean, review #10/#14).
  async function handleSso() {
    setError(null);
    if (!email) {
      setError("Enter your work email to continue with SSO.");
      return;
    }
    setSsoLoading(true);
    try {
      const res = await fetch("/api/auth/sso/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { available?: boolean };
      if (data.available) {
        // login_hint is the only client-supplied input; the tenant is resolved
        // server-side in the authorize bridge.
        await signIn("boxyhq-saml", { callbackUrl: "/dashboard" }, { login_hint: email });
      } else {
        setError("Single sign-on isn't set up for this email domain.");
        setSsoLoading(false);
      }
    } catch {
      setError("Couldn't start SSO. Please try again.");
      setSsoLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // NextAuth returns "AccessDenied" when the signIn callback blocks a non-SSO
      // login on an SSO-enforced domain (#24) — point the user at SSO instead of
      // implying their password was wrong.
      setError(
        result.error === "AccessDenied"
          ? 'Your organization requires single sign-on — use "Continue with SSO" below.'
          : t("login.invalidCredentials")
      );
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen items-start pt-[15vh] sm:items-center sm:pt-0 justify-center px-4 py-8 bg-neutral-50 dark:bg-neutral-950">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 dark:bg-white">
            <svg className="h-6 w-6 text-white dark:text-neutral-900" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
              <path d="M13 1.5 24.5 7.5 13 13.5 1.5 7.5 13 1.5Z" fill="currentColor" />
              <path d="M1.5 13 13 19 24.5 13" />
              <path d="M1.5 18.5 13 24.5 24.5 18.5" />
            </svg>
          </div>
          <CardTitle className="text-xl">{t("login.title")}</CardTitle>
          <CardDescription>
            {t("login.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {t("login.email")}
              </label>
              <Input
                id="email"
                type="email"
                placeholder="admin@reglayer.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {t("login.password")}
                </label>
                <Link href="/auth/forgot-password" className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("login.signIn")}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-neutral-900 px-2 text-neutral-500 dark:text-neutral-400">{t("login.orContinueWith")}</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {t("login.continueGoogle")}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={handleSso}
            disabled={ssoLoading}
          >
            {ssoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with SSO
          </Button>

          <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Don&apos;t have an account?{" "}
            <Link href="/auth/register" className="font-medium text-neutral-900 dark:text-white hover:underline">
              Sign up free
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
