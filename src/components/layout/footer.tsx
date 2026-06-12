/**
 * ---------------------------------------------------------
 * RegLayer — Footer Component
 * ---------------------------------------------------------
 *
 * WHY: Public pages need a consistent footer with navigation links.
 *
 * WHAT:
 * - 4-column layout: Brand, Product, Legal, Support
 * - Product links: Features, Pricing, Standards
 * - Legal links: Privacy, Terms, Cookie Policy
 * - Support links: Docs, API Reference, Contact
 * - Copyright notice
 *
 * HOW:
 * - Server component (no "use client")
 * - Used by landing page, pricing, docs, and other public pages
 * - Responsive: stacks to 1 column on mobile
 * ---------------------------------------------------------
 */

import Link from "next/link";
import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image
                src="/assests/reglayer-logo-footer.svg"
                alt="RegLayer"
                width={176}
                height={38}
                className="h-8 w-auto"
              />
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Web Accessibility compliance platform. Automated scanning, monitoring, and reporting for global standards.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">Product</p>
            <ul className="space-y-1">
              <li><Link href="/features" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Features</Link></li>
              <li><Link href="/pricing" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Pricing</Link></li>
              <li><Link href="/standards" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Standards</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">Legal</p>
            <ul className="space-y-1">
              <li><Link href="/privacy" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/terms" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Terms of Service</Link></li>
              <li><Link href="/cookie-policy" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Cookie Policy</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">Support</p>
            <ul className="space-y-1">
              <li><Link href="/docs" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Documentation</Link></li>
              <li><Link href="/api-reference" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">API Reference</Link></li>
              <li><Link href="/contact" className="inline-block py-1 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">Contact</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-6">
        <div className="border-t border-neutral-200 dark:border-neutral-700 mt-8 pt-6 flex justify-center">
          <p className="text-xs text-neutral-500 dark:text-neutral-500">© {new Date().getFullYear()} RegLayer. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
