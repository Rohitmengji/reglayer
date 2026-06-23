"use client";

/**
 * RegLayer — Contact Page
 *
 * WHY: Users (incl. Enterprise buyers via "Contact Sales") need a reliable way to
 *      reach support, sales, or report issues — with no silent failures.
 * WHAT: Contact form (name, email, company, subject, message) that POSTs to
 *       /api/contact, plus company info. Real loading / success / error states;
 *       the Enterprise CTA deep-links here via ?subject=enterprise.
 * HOW: Client component. Honest error handling — every failure shows the user the
 *       next step (retry, or email us directly). Honeypot field deters bots.
 */

import { Shield, Mail, MessageSquare, MapPin, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { ModernSelect } from "@/components/ui/modern-select";
import type { TranslationKey } from "@/lib/i18n/translations";

type Status = "idle" | "submitting" | "success" | "error";

const VALID_SUBJECTS = ["general", "support", "enterprise", "partnership", "bug"];

function codeToErrorKey(code: unknown): TranslationKey {
  switch (code) {
    case "rate_limited":
      return "contact.errorRateLimit";
    case "email_unavailable":
      return "contact.errorUnavailable";
    case "validation":
      return "contact.errorValidation";
    default:
      return "contact.errorGeneric";
  }
}

export default function ContactPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<TranslationKey>("contact.errorGeneric");
  const [subject, setSubject] = useState("general");

  // Deep-link support: /contact?subject=enterprise pre-selects the topic.
  // Applied post-mount (not via a lazy initializer) so the client's first render
  // matches the server HTML and we avoid a hydration mismatch on the select.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("subject");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: one-time sync of the subject select from the URL on mount
    if (param && VALID_SUBJECTS.includes(param)) setSubject(param);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      company: String(fd.get("company") || ""),
      message: String(fd.get("message") || ""),
      website: String(fd.get("website") || ""), // honeypot
      subject,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus("success");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setErrorKey(codeToErrorKey(data?.code));
      setStatus("error");
    } catch {
      setErrorKey("contact.errorGeneric");
      setStatus("error");
    }
  }

  const submitting = status === "submitting";

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link
            href="/"
            className="flex items-center gap-2 text-neutral-900 dark:text-white rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white"
          >
            <Shield className="h-5 w-5" aria-hidden="true" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">{t("contact.title")}</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">{t("contact.subtitle")}</p>

        <div className="grid gap-10 md:grid-cols-2">
          {/* Contact Info */}
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-medium text-neutral-900 dark:text-white">{t("contact.email")}</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  General: <a href="mailto:hello@reglayer.dev" className="text-blue-600 dark:text-blue-400 hover:underline">hello@reglayer.dev</a>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Support: <a href="mailto:support@reglayer.dev" className="text-blue-600 dark:text-blue-400 hover:underline">support@reglayer.dev</a>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Sales: <a href="mailto:sales@reglayer.dev" className="text-blue-600 dark:text-blue-400 hover:underline">sales@reglayer.dev</a>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-medium text-neutral-900 dark:text-white">{t("contact.responseTime")}</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">{t("contact.responseTimeDesc")}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-medium text-neutral-900 dark:text-white">{t("contact.location")}</h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  RegLayer<br />
                  Remote-first team
                </p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
            {status === "success" ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" aria-hidden="true" />
                </div>
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">{t("contact.sent")}</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("contact.sentDesc")}</p>
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="mt-6 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-white"
                >
                  {t("contact.sendAnother")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Honeypot: hidden from users and AT; bots fill it and get dropped. */}
                <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden" >
                  <label htmlFor="website">Leave this field empty</label>
                  <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                {status === "error" && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-medium">{t("contact.errorTitle")}</p>
                      <p className="mt-0.5">{t(errorKey)}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.name")} <span className="text-red-600 dark:text-red-400" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                    placeholder={t("contact.namePlaceholder")}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.email")} <span className="text-red-600 dark:text-red-400" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    maxLength={200}
                    autoComplete="email"
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                    placeholder={t("contact.emailPlaceholder")}
                  />
                </div>
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.company")}
                  </label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    maxLength={200}
                    autoComplete="organization"
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                    placeholder={t("contact.companyPlaceholder")}
                  />
                </div>
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.subject")}
                  </label>
                  <ModernSelect
                    options={[
                      { value: "general", label: t("contact.subjectGeneral") },
                      { value: "support", label: t("contact.subjectSupport") },
                      { value: "enterprise", label: t("contact.subjectEnterprise") },
                      { value: "partnership", label: t("contact.subjectPartnership") },
                      { value: "bug", label: t("contact.subjectBug") },
                    ]}
                    value={subject}
                    onChange={setSubject}
                  />
                </div>
                {subject === "enterprise" && (
                  <p className="rounded-lg bg-indigo-50 dark:bg-indigo-500/10 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
                    {t("contact.enterpriseNote")}
                  </p>
                )}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.message")} <span className="text-red-600 dark:text-red-400" aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    minLength={10}
                    maxLength={5000}
                    rows={4}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white resize-none"
                    placeholder={t("contact.messagePlaceholder")}
                  />
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("contact.requiredNote")}</p>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {submitting ? t("contact.sending") : t("contact.send")}
                </Button>
                {/* Polite status for screen readers */}
                <p className="sr-only" aria-live="polite">
                  {submitting ? t("contact.sending") : status === "error" ? t(errorKey) : ""}
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
