/**
 * RegLayer — Privacy Policy Page
 *
 * WHY: GDPR requires a public privacy policy for EU users.
 * WHAT: Full privacy policy covering data collection, processing, retention, rights.
 * HOW: Static content page. Server-rendered for SEO.
 */
import { Shield } from "lucide-react";
import Link from "next/link";
import { Footer } from "@/components/layout/footer";

export const metadata = {
  title: "Privacy Policy — RegLayer",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-neutral-500 mb-8">Last updated: May 25, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">1. Data Controller</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              RegLayer (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is the data controller for personal data processed through this platform. 
              We process data in accordance with the EU General Data Protection Regulation (GDPR, Regulation 2016/679) 
              and the ePrivacy Directive.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">2. Data We Collect</h2>
            <div className="space-y-3 text-neutral-600 dark:text-neutral-300">
              <p><strong className="text-neutral-900 dark:text-white">Account Data:</strong> Email address, name (via Google OAuth). Legal basis: Contract performance (Art. 6(1)(b) GDPR).</p>
              <p><strong className="text-neutral-900 dark:text-white">Scan Data:</strong> URLs you submit for scanning, scan results, violation data. Legal basis: Contract performance.</p>
              <p><strong className="text-neutral-900 dark:text-white">Usage Data:</strong> Page views, feature usage (only with your consent). Legal basis: Consent (Art. 6(1)(a) GDPR).</p>
              <p><strong className="text-neutral-900 dark:text-white">Technical Data:</strong> IP address (anonymized), browser type, for security. Legal basis: Legitimate interest (Art. 6(1)(f) GDPR).</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">3. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-300">
              <li>Provide accessibility scanning and compliance monitoring services</li>
              <li>Generate compliance reports and accessibility statements</li>
              <li>Send scheduled scan notifications (only when configured)</li>
              <li>Improve our service (aggregated, anonymized analytics only with consent)</li>
              <li>Protect against abuse and ensure platform security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">4. Data Storage & Transfer</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              All data is stored within the European Union (Frankfurt, Germany). We do not transfer personal data 
              outside the EEA without adequate safeguards as required by GDPR Chapter V.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">5. Data Retention</h2>
            <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
              <p><strong className="text-neutral-900 dark:text-white">Account data:</strong> Retained while your account is active, deleted within 30 days of account closure.</p>
              <p><strong className="text-neutral-900 dark:text-white">Scan results:</strong> Retained for 12 months, then automatically anonymized.</p>
              <p><strong className="text-neutral-900 dark:text-white">Audit logs:</strong> Retained for 24 months for compliance purposes.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">6. Your Rights (GDPR Articles 15-22)</h2>
            <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-300">
              <li><strong>Access (Art. 15):</strong> Request a copy of your personal data</li>
              <li><strong>Rectification (Art. 16):</strong> Correct inaccurate personal data</li>
              <li><strong>Erasure (Art. 17):</strong> Request deletion of your data (&quot;right to be forgotten&quot;)</li>
              <li><strong>Portability (Art. 20):</strong> Receive your data in a machine-readable format</li>
              <li><strong>Restriction (Art. 18):</strong> Restrict processing of your data</li>
              <li><strong>Objection (Art. 21):</strong> Object to processing based on legitimate interest</li>
              <li><strong>Withdraw consent:</strong> Withdraw consent at any time without affecting prior processing</li>
            </ul>
            <p className="mt-3 text-neutral-600 dark:text-neutral-300">
              To exercise your rights, contact us at <a href="mailto:privacy@reglayer.dev" className="text-blue-600">privacy@reglayer.dev</a>. 
              We respond within 30 days as required by GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">7. Cookies</h2>
            <div className="space-y-2 text-neutral-600 dark:text-neutral-300">
              <p><strong className="text-neutral-900 dark:text-white">Essential cookies:</strong> Authentication session, theme preference. Cannot be disabled.</p>
              <p><strong className="text-neutral-900 dark:text-white">Analytics cookies:</strong> Usage analytics (only with consent). Can be managed in Settings.</p>
              <p>You can change your cookie preferences at any time via the cookie settings in the platform footer or Settings page.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">8. Sub-processors</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                <thead className="bg-neutral-50 dark:bg-neutral-800">
                  <tr>
                    <th className="text-left p-3 font-medium">Processor</th>
                    <th className="text-left p-3 font-medium">Purpose</th>
                    <th className="text-left p-3 font-medium">Location</th>
                  </tr>
                </thead>
                <tbody className="text-neutral-600 dark:text-neutral-300">
                  <tr className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="p-3">Neon (Neon Inc.)</td>
                    <td className="p-3">Database hosting</td>
                    <td className="p-3">EU (Frankfurt)</td>
                  </tr>
                  <tr className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="p-3">Vercel Inc.</td>
                    <td className="p-3">Application hosting</td>
                    <td className="p-3">EU (Frankfurt)</td>
                  </tr>
                  <tr className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="p-3">OpenAI</td>
                    <td className="p-3">AI explanations (no PII sent)</td>
                    <td className="p-3">US (DPA in place)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">9. Supervisory Authority</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              You have the right to lodge a complaint with your local data protection authority. 
              Our lead supervisory authority is the Irish Data Protection Commission (DPC).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">10. Contact</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              For privacy-related inquiries: <a href="mailto:privacy@reglayer.dev" className="text-blue-600">privacy@reglayer.dev</a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-neutral-100 dark:border-neutral-800">
          <Link href="/" className="text-sm text-blue-600">← Back to RegLayer</Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
