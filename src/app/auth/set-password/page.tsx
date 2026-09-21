"use client";

/**
 * RegLayer — First Sign-In Password Setup
 *
 * WHY: members invited by email arrive with a temporary password. Until they
 *      replace it, the rest of the product is blocked, so this page has to be a
 *      clear, self-contained step rather than a dismissible prompt.
 * HOW: posts to /api/account/set-password, refreshes the session so the block
 *      lifts immediately, then continues to the dashboard.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function SetPasswordPage() {
  const { status, update } = useSession();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/login");
  }, [status, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);

    if (password !== confirmation) {
      setError("Both passwords must match.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/account/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "The password could not be saved. Try again.");
        return;
      }
      // Refresh the session so the temporary-password restriction is lifted
      // before we navigate, otherwise the dashboard bounces straight back here.
      await update();
      router.replace("/dashboard");
    } catch {
      setError("The password could not be confirmed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading your account…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose your password</CardTitle>
          <CardDescription>
            You signed in with a temporary password from your invitation. Choose your own password to finish setting up your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-sm font-medium text-neutral-900 dark:text-white">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={12}
                aria-describedby="password-rules"
              />
              <p id="password-rules" className="text-xs text-neutral-600 dark:text-neutral-400">
                At least 12 characters, with an uppercase letter, a lowercase letter and a number.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-neutral-900 dark:text-white">
                Confirm new password
              </label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                minLength={12}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {saving ? "Saving password…" : "Save password and continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
