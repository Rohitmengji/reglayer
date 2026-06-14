"use client";

/**
 * RegLayer — Cookie Policy Page
 *
 * WHY: EU ePrivacy Directive requires disclosure of cookie usage.
 * WHAT: Lists all cookies used, their purpose, duration, and necessity.
 * HOW: Client component with i18n for titles.
 */
import { Shield } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";
import { useI18n } from "@/components/i18n-provider";

export default function CookiePolicyPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">{t("cookiePolicy.title")}</h1>
        <p className="text-sm text-neutral-500 mb-8">{t("cookiePolicy.lastUpdated")}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">1. What Are Cookies</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              Cookies are small text files stored on your device when you visit a website. They help websites 
              function properly, remember your preferences, and provide usage analytics. This policy explains 
              how RegLayer uses cookies in compliance with the ePrivacy Directive (2002/58/EC) and GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">2. Cookies We Use</h2>
            <div className="space-y-4">
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
                <table className="w-full text-sm min-w-125">
                  <thead className="bg-neutral-50 dark:bg-neutral-900">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Cookie</th>
                      <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Purpose</th>
                      <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Duration</th>
                      <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-600 dark:text-neutral-300">
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">next-auth.session-token</td>
                      <td className="px-4 py-2">Authentication session</td>
                      <td className="px-4 py-2">Session</td>
                      <td className="px-4 py-2">Strictly Necessary</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">next-auth.csrf-token</td>
                      <td className="px-4 py-2">CSRF protection</td>
                      <td className="px-4 py-2">Session</td>
                      <td className="px-4 py-2">Strictly Necessary</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">reglayer-locale</td>
                      <td className="px-4 py-2">Language preference</td>
                      <td className="px-4 py-2">1 year</td>
                      <td className="px-4 py-2">Functional</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">reglayer-theme</td>
                      <td className="px-4 py-2">Dark/light mode preference</td>
                      <td className="px-4 py-2">1 year</td>
                      <td className="px-4 py-2">Functional</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 font-mono text-xs">reglayer-consent</td>
                      <td className="px-4 py-2">Cookie consent choice</td>
                      <td className="px-4 py-2">1 year</td>
                      <td className="px-4 py-2">Strictly Necessary</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">3. Cookie Categories</h2>
            <div className="space-y-3 text-neutral-600 dark:text-neutral-300">
              <p><strong className="text-neutral-900 dark:text-white">Strictly Necessary:</strong> Required for the Service to function. These cannot be disabled. They include authentication tokens and security measures.</p>
              <p><strong className="text-neutral-900 dark:text-white">Functional:</strong> Remember your preferences like language and theme. These improve your experience but the Service works without them.</p>
              <p><strong className="text-neutral-900 dark:text-white">Analytics:</strong> Help us understand how the Service is used. Only set with your explicit consent. We do not use third-party analytics services; all analytics are self-hosted.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">4. Your Choices</h2>
            <div className="space-y-3 text-neutral-600 dark:text-neutral-300">
              <p>When you first visit RegLayer, our cookie consent banner lets you accept or reject non-essential cookies. You can change your preferences at any time:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Use the cookie settings in your account preferences</li>
                <li>Clear cookies through your browser settings</li>
                <li>Use browser extensions to manage cookie consent</li>
              </ul>
              <p>Note: Blocking strictly necessary cookies will prevent the Service from functioning.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">5. Third-Party Cookies</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              RegLayer does not use third-party advertising or tracking cookies. If you sign in via Google OAuth, 
              Google may set its own cookies subject to{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600">
                Google&apos;s Privacy Policy
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">6. Updates to This Policy</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              We may update this Cookie Policy to reflect changes in our practices or legal requirements. 
              Changes will be posted on this page with an updated date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">7. Contact</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              Questions about our cookie usage? Contact us at{" "}
              <a href="mailto:privacy@reglayer.dev" className="text-blue-600">privacy@reglayer.dev</a>.
            </p>
          </section>
        </div>
      </div>
      <Footer />
    </div>
  );
}
