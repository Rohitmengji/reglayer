import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { CookieConsent } from "@/components/cookie-consent";
import { Toaster } from "sonner";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("reglayer-theme");if(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          {children}
          <CookieConsent />
          <Toaster position="top-right" richColors closeButton />
        </Providers>
      </body>
    </html>
  );
}
