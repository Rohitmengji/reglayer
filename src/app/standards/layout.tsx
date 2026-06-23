import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Standards — WCAG, ADA, EAA, Section 508, AODA",
  description: "RegLayer supports WCAG 2.2, ADA, European Accessibility Act (EN 301 549), Section 508, and AODA. Understand each standard and how RegLayer maps violations to specific criteria.",
  openGraph: {
    title: "Accessibility Standards Supported by RegLayer",
    description: "Full support for WCAG 2.2, ADA, EAA, Section 508, and AODA with per-criterion violation mapping.",
    url: "/standards",
  },
};

export default function StandardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
