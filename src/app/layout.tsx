/**
 * ---------------------------------------------------------
 * RegLayer — Root Layout
 * ---------------------------------------------------------
 *
 * WHY: This is the HTML shell for the entire application.
 * Every page renders inside this layout.
 *
 * WHAT:
 * - Loads Inter (UI) and JetBrains Mono (code) fonts
 * - Sets SEO metadata (title, description, OpenGraph, Twitter cards)
 * - Implements flash-free dark mode (3 layers of defense in <head>)
 * - Wraps all pages in Providers (auth, query, theme, i18n)
 * - Adds global Toaster for notifications and CookieConsent banner
 *
 * HOW:
 * - Dark mode flash prevention:
 *   1. CSS @media query for system-dark users (no JS needed)
 *   2. Inline <script> runs before paint to add .dark/.light class
 *   3. <meta color-scheme> tells browser to use dark canvas during navigation
 * - Providers hierarchy: SessionProvider → QueryClient → Theme → I18n
 * ---------------------------------------------------------
 */

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { headers } from "next/headers";
import { Providers } from "@/components/providers";
import { CookieConsent } from "@/components/cookie-consent";
import { Toaster } from "sonner";
import { resolveAgency } from "@/lib/tenant/resolver";
import type { BrandContextType } from "@/components/layout/BrandProvider";
import "./globals.css";

// Primary typeface — Inter: industry-standard UI font used by Linear, Vercel, Stripe
// Variable font: single file, all weights, optimal rendering, zero layout shift
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Monospace — JetBrains Mono: engineered for code readability, ligatures, distinct glyphs
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const DEFAULT_SITE_URL = "https://reglayer.vercel.app";

function getMetadataBase(): URL {
  const rawUrl = (process.env.NEXTAUTH_URL ?? "").trim();
  try {
    return new URL(rawUrl || DEFAULT_SITE_URL);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export const metadata: Metadata = {
  title: {
    default: "RegLayer — Accessibility Scanner",
    template: "%s | RegLayer",
  },
  description: "Developer-native compliance infrastructure. Scan websites for accessibility issues, generate WCAG reports, and ship inclusive products.",
  metadataBase: getMetadataBase(),
  openGraph: {
    title: "RegLayer — Accessibility Scanner",
    description: "Developer-native compliance infrastructure. Scan websites for WCAG violations, generate audit reports, and build accessible products.",
    url: "/",
    siteName: "RegLayer",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RegLayer — Accessibility Scanner",
    description: "Developer-native compliance infrastructure for WCAG accessibility.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve agency branding from hostname (set by proxy middleware)
  const headersList = await headers();
  const agencyHostname = headersList.get("x-agency-hostname");
  const agencySlug = headersList.get("x-agency-slug");

  let brand: BrandContextType = {
    brandName: "RegLayer",
    primaryColor: "#6366f1",
    accentColor: "#4f46e5",
    logoUrl: null,
    faviconUrl: null,
    supportEmail: null,
    isAgency: false,
    agencySlug: null,
    showPoweredBy: false,
  };

  if (agencyHostname) {
    const agency = await resolveAgency(agencyHostname);
    if (agency) {
      brand = {
        brandName: agency.brandName,
        primaryColor: agency.primaryColor,
        accentColor: agency.accentColor,
        logoUrl: agency.logoUrl,
        faviconUrl: agency.faviconUrl,
        supportEmail: agency.supportEmail,
        isAgency: true,
        agencySlug: agencySlug || agency.slug,
        showPoweredBy: agency.plan === "STARTER",
      };
    }
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* color-scheme meta: tells the browser to use dark canvas during navigation transitions.
            "dark light" means: prefer dark if system is dark, which prevents the white blank frame
            the browser shows between unloading old page and painting new one. */}
        <meta name="color-scheme" content="dark light" />
        {/* Critical dark-mode styles — must be in <head> for immediate effect before first paint.
            Three layers of defense:
            1. @media query: handles system-dark users instantly (no script needed)
            2. html.dark: handles explicit dark preference (after script adds class)
            3. html.light: overrides media query when user explicitly chose light */}
        <style
          dangerouslySetInnerHTML={{
            __html: [
              `@media(prefers-color-scheme:dark){html:not(.light){background-color:#09090b;color-scheme:dark}html:not(.light) body{background-color:#09090b}}`,
              `html.dark{background-color:#09090b;color-scheme:dark}html.dark body{background-color:#09090b}`,
              `html.light{background-color:#fff;color-scheme:light}html.light body{background-color:#fff}`,
            ].join(""),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("reglayer-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}else if(t==="light"){document.documentElement.classList.add("light")}}catch(e){}})()`,
          }}
        />
        <Providers brand={brand}>
          {children}
          <CookieConsent />
          <Toaster position="top-right" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
