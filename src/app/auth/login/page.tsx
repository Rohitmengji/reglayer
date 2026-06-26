"use client";

/**
 * RegLayer — Login Page
 *
 * WHY: Authentication gateway. Users must sign in to use the platform.
 * WHAT: Email/password + Google OAuth + an Enterprise SSO entry point. The SSO
 *       flow is a focused two-step: click "Continue with SSO" → enter your work
 *       email → we resolve your org's verified domain and redirect to its IdP.
 * HOW: next-auth signIn() for every provider. Discovery returns a bare boolean
 *      (non-revealing, review #10/#14); the tenant is resolved server-side in the
 *      authorize bridge, never supplied by the client.
 */

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ArrowLeft, Lock } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

type Mode = "password" | "sso";

/**
 * Map the ?error= codes that bounce a user back to /auth/login onto friendly,
 * non-revealing messages. Anything unmapped falls back to a generic message so a
 * failure is NEVER silent. Sources: the SSO bridge (src/app/api/auth/sso/*) and
 * NextAuth provider/callback errors.
 */
const LOGIN_ERROR_KEYS: Record<string, TranslationKey> = {
  sso_not_available: "login.ssoNotAvailable",
  sso_error: "login.ssoError",
  sso_invalid_request: "login.ssoError",
  sso_assertion_failed: "login.ssoAssertionFailed",
  sso_oidc_failed: "login.ssoOidcFailed",
  CredentialsSignin: "login.invalidCredentials",
  // The only AccessDenied our code emits is a non-SSO login blocked on an
  // SSO-enforced domain — nudge them to the SSO button.
  AccessDenied: "login.ssoRequired",
  Configuration: "login.errorConfiguration",
  OAuthSignin: "login.errorSignin",
  OAuthCallback: "login.errorSignin",
  OAuthCreateAccount: "login.errorSignin",
  Callback: "login.errorSignin",
  Verification: "login.errorSignin",
  SessionRequired: "login.errorSignin",
};

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  // Move focus to the SSO email field when the step opens (id-based so we don't
  // depend on the Input component forwarding a ref, and avoids the autoFocus lint).
  useEffect(() => {
    if (mode === "sso") document.getElementById("sso-email")?.focus();
  }, [mode]);

  // Surface a server/NextAuth error handed back via ?error= — otherwise an SSO
  // round-trip failure is a silent dead-end. Seed the message once, then strip
  // the param so a refresh doesn't resurface a stale error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (!code) return;
    // One-time sync of an external source (the URL) into local state on mount;
    // the param is stripped immediately below so it can't re-fire or resurface.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(t(LOGIN_ERROR_KEYS[code] ?? "login.errorSignin"));
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [t]);

  function openSso() {
    setError(null);
    setMode("sso");
  }

  function backToPassword() {
    setError(null);
    setSsoLoading(false);
    setMode("password");
  }

  // Step 2 of the SSO flow: resolve the email's domain → redirect to the IdP.
  async function handleSso(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const work = email.trim();
    if (!work) {
      setError(t("login.ssoEmailRequired"));
      return;
    }
    setSsoLoading(true);
    try {
      const res = await fetch("/api/auth/sso/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: work }),
      });
      const data = (await res.json()) as { available?: boolean };
      if (data.available) {
        // login_hint is the only client-supplied input; the tenant is resolved
        // server-side in the authorize bridge. This navigates away (redirect).
        await signIn("boxyhq-saml", { callbackUrl: "/dashboard" }, { login_hint: work });
      } else {
        // Non-revealing miss: don't dead-end — let them fix the email or go back.
        setError(t("login.ssoNotAvailable"));
        setSsoLoading(false);
      }
    } catch {
      setError(t("login.ssoError"));
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
          ? t("login.ssoRequired")
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
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "sso" ? (
            /* ── Focused SSO step ─────────────────────────────── */
            <div className="space-y-5">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <Lock className="h-5 w-5 text-neutral-700 dark:text-neutral-200" aria-hidden="true" />
                </div>
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white">{t("login.ssoStepTitle")}</h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("login.ssoStepSubtitle")}</p>
              </div>

              <form onSubmit={handleSso} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="sso-email" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t("login.ssoEmailLabel")}
                  </label>
                  <Input
                    id="sso-email"
                    type="email"
                    placeholder="you@yourcompany.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600" role="alert" aria-live="polite">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={ssoLoading}>
                  {ssoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {ssoLoading ? t("login.ssoRedirecting") : t("login.ssoContinue")}
                </Button>
              </form>

              <button
                type="button"
                onClick={backToPassword}
                className="mt-4 mx-auto flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("login.ssoBack")}
              </button>
            </div>
          ) : (
            /* ── Default: email/password + Google + SSO entry ─── */
            <>
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
                {error && <p className="text-sm text-red-600" role="alert" aria-live="polite">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {t("login.continueGoogle")}
              </Button>

              <Button type="button" variant="outline" className="mt-3 w-full" onClick={openSso}>
                <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("login.continueSSO")}
              </Button>

              <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Don&apos;t have an account?{" "}
                <Link href="/auth/register" className="font-medium text-neutral-900 dark:text-white hover:underline">
                  Sign up free
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
