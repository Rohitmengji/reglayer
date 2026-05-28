import { Shield } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service — RegLayer",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-neutral-500 mb-8">Last updated: May 25, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed space-y-6">
          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">1. Acceptance of Terms</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              By accessing or using RegLayer (&quot;the Service&quot;), you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, do not use the Service. These terms constitute a legal agreement 
              between you and RegLayer GmbH (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), registered in Frankfurt, Germany.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">2. Description of Service</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              RegLayer provides automated web accessibility scanning, compliance monitoring, and reporting tools. 
              The Service helps organizations assess their digital products against WCAG 2.2, ADA, Section 508, EN 301 549, 
              and other global accessibility requirements.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">3. Account Registration</h2>
            <div className="space-y-3 text-neutral-600 dark:text-neutral-300">
              <p>To use the Service, you must create an account. You agree to:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Provide accurate and complete registration information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Notify us immediately of any unauthorized access</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">4. Acceptable Use</h2>
            <div className="space-y-3 text-neutral-600 dark:text-neutral-300">
              <p>You agree not to:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Scan websites you do not own or have authorization to test</li>
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Attempt to overload, disrupt, or compromise our infrastructure</li>
                <li>Resell or redistribute Service access without authorization</li>
                <li>Reverse-engineer or attempt to extract source code from the Service</li>
                <li>Use automated tools to scrape or extract data beyond API rate limits</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">5. Subscriptions & Billing</h2>
            <div className="space-y-3 text-neutral-600 dark:text-neutral-300">
              <p>
                Paid plans are billed monthly or annually in advance. You may upgrade, downgrade, or cancel at any time. 
                Cancellations take effect at the end of the current billing period. Refunds are provided within 
                14 days of initial purchase per EU consumer protection law.
              </p>
              <p>
                Free plan users are subject to usage limits as described on our <Link href="/pricing" className="text-blue-600 hover:underline">pricing page</Link>. 
                We reserve the right to modify plan features with 30 days&apos; notice.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">6. Intellectual Property</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              The Service, including its design, features, and documentation, is the property of RegLayer GmbH. 
              You retain all rights to your content (scan targets, reports). We grant you a limited, non-exclusive 
              license to use the Service for its intended purpose during your subscription.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">7. Disclaimer of Warranties</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              The Service is provided &quot;as is&quot; without warranties of any kind. While we strive for accuracy, 
              automated accessibility scans cannot identify all accessibility barriers. RegLayer scan results 
              do not constitute legal compliance certification. We recommend supplementing automated testing 
              with manual audits and user testing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">8. Limitation of Liability</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              To the maximum extent permitted by law, RegLayer shall not be liable for indirect, incidental, 
              or consequential damages arising from use of the Service. Our total liability shall not exceed 
              the amount paid by you in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">9. Termination</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              We may suspend or terminate your access if you violate these terms. Upon termination, 
              you may export your data within 30 days. After this period, we will delete your account 
              data in accordance with our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">10. Governing Law</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              These terms are governed by the laws of the Federal Republic of Germany. Any disputes 
              shall be resolved in the courts of Frankfurt am Main, subject to mandatory EU consumer 
              protection provisions that may grant you the right to bring proceedings in your country of residence.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">11. Changes to Terms</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              We may update these terms with 30 days&apos; notice via email or in-app notification. 
              Continued use after the notice period constitutes acceptance of updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mt-8 mb-3">12. Contact</h2>
            <p className="text-neutral-600 dark:text-neutral-300">
              For questions about these terms, contact us at{" "}
              <a href="mailto:legal@reglayer.dev" className="text-blue-600 hover:underline">legal@reglayer.dev</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
