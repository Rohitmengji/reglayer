"use client";

import { signOutAndClear } from "@/lib/auth/sign-out";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LogOut, Loader2 } from "lucide-react";

export default function SignOutPage() {
  const [loading, setLoading] = useState(false);

  function handleSignOut() {
    setLoading(true);
    signOutAndClear({ callbackUrl: "/auth/login" });
  }

  return (
    <div className="flex min-h-screen items-start pt-[15vh] sm:items-center sm:pt-0 justify-center px-4 py-8 bg-neutral-50 dark:bg-neutral-950">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 dark:bg-white">
            <LogOut className="h-6 w-6 text-white dark:text-neutral-900" />
          </div>
          <CardTitle className="text-xl">Sign out</CardTitle>
          <CardDescription>
            Are you sure you want to sign out of RegLayer?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleSignOut}
            className="w-full"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
            Sign out
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.history.back()}
            disabled={loading}
          >
            Cancel
          </Button>
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            You&apos;ll need to sign in again to access your workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
