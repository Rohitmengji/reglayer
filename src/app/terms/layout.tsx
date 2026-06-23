import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing use of the RegLayer web accessibility compliance platform. Covers acceptable use, billing, intellectual property, and liability.",
  openGraph: {
    title: "RegLayer Terms of Service",
    description: "Terms governing use of the RegLayer accessibility compliance platform.",
    url: "/terms",
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
