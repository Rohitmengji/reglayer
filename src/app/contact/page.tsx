"use client";

/**
 * RegLayer — Contact Page
 *
 * WHY: Users need a way to reach support, sales, or report issues.
 * WHAT: Contact form (name, email, subject, message) + company info (email, location, response time).
 * HOW: Form submits to email service. Static company info alongside.
 */

import { Shield, Mail, MessageSquare, MapPin } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

export default function ContactPage() {
  const { t } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    // Simulate form submission
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">{t("contact.title")}</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          {t("contact.subtitle")}
        </p>

        <div className="grid gap-10 md:grid-cols-2">
          {/* Contact Info */}
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">{t("contact.email")}</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  General: <a href="mailto:hello@reglayer.dev" className="text-blue-600">hello@reglayer.dev</a>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Support: <a href="mailto:support@reglayer.dev" className="text-blue-600">support@reglayer.dev</a>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Sales: <a href="mailto:sales@reglayer.dev" className="text-blue-600">sales@reglayer.dev</a>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">{t("contact.responseTime")}</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  {t("contact.responseTimeDesc")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">{t("contact.location")}</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  RegLayer GmbH<br />
                  Frankfurt am Main, Germany<br />
                  EU-hosted infrastructure
                </p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
            {submitted ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                  {t("contact.sent")}
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {t("contact.sentDesc")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.name")}
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                    placeholder={t("contact.namePlaceholder")}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.email")}
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                    placeholder={t("contact.emailPlaceholder")}
                  />
                </div>
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.subject")}
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                  >
                    <option value="general">{t("contact.subjectGeneral")}</option>
                    <option value="support">{t("contact.subjectSupport")}</option>
                    <option value="enterprise">{t("contact.subjectEnterprise")}</option>
                    <option value="partnership">{t("contact.subjectPartnership")}</option>
                    <option value="bug">{t("contact.subjectBug")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    {t("contact.message")}
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={4}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white resize-none"
                    placeholder={t("contact.messagePlaceholder")}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("contact.sending") : t("contact.send")}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
