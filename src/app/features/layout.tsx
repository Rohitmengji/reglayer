import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features — Everything You Need for Accessibility Compliance",
  description: "Automated WCAG scanning, continuous monitoring, compliance analytics, PDF reports, developer API, team collaboration, AI insights, and global standards support.",
  openGraph: {
    title: "RegLayer Features — Full Accessibility Compliance Toolkit",
    description: "From automated scanning to AI-powered remediation — everything development teams need for WCAG, ADA, EAA, and Section 508 compliance.",
    url: "/features",
  },
};

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
