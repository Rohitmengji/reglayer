"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Clock, Send, LogOut } from "lucide-react";

export default function RequestAccessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    // Check if user already has workspace access or a pending request
    if (status === "authenticated") {
      fetch("/api/team")
        .then((res) => res.json())
        .then((data) => {
          if (data.members && data.members.length > 0) {
            // User has access, redirect to dashboard
            router.push("/dashboard");
          } else {
            // Check if user already has a pending request
            fetch("/api/access-request")
              .then((res) => res.json())
              .then((reqData) => {
                if (reqData.myRequest && reqData.myRequest.status === "PENDING") {
                  setSubmitted(true);
                }
                setCheckingAccess(false);
              })
              .catch(() => setCheckingAccess(false));
          }
        })
        .catch(() => setCheckingAccess(false));
    }
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const toastId = toast.loading("Submitting request...");

    const res = await fetch("/api/access-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message || undefined }),
    });

    const data = await res.json();
    if (res.ok) {
      toast.success("Access request submitted successfully", { id: toastId });
      setSubmitted(true);
    } else {
      if (data.error === "You already have a pending request") {
        toast.info("You already have a pending request", { id: toastId });
        setSubmitted(true);
      } else {
        toast.error(data.error || "Failed to submit request", { id: toastId });
        setError(data.error || "Failed to submit request");
      }
    }
    setLoading(false);
  }

  if (status === "loading" || checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Welcome to RegLayer</h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Signed in as <strong>{session?.user?.email}</strong>
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            {submitted ? (
              /* Success State */
              <div className="text-center space-y-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    Request Submitted
                  </h2>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    Your access request has been sent to the admin team. You&apos;ll be
                    granted access once approved. Check back soon!
                  </p>
                </div>
                <div className="pt-2 flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.location.reload()}
                  >
                    <Clock className="h-4 w-4 mr-2" /> Check Status
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-neutral-500"
                    onClick={() => signOut({ callbackUrl: "/auth/login" })}
                  >
                    <LogOut className="h-4 w-4 mr-2" /> Sign Out
                  </Button>
                </div>
              </div>
            ) : (
              /* Request Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    Request Access
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    You don&apos;t have access to any workspace yet. Submit a request and
                    your admin will grant you access.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Message (optional)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Hi, I'd like access to run accessibility scans for our team..."
                    rows={3}
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100 resize-none"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  <Send className="h-4 w-4 mr-2" />
                  {loading ? "Submitting..." : "Request Access"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-neutral-400 dark:text-neutral-500">
          Your admin will be notified and can approve your request from the admin panel.
        </p>
      </div>
    </div>
  );
}
