import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Web Accessibility Insights",
  description: "Expert articles on WCAG compliance, European Accessibility Act, ADA lawsuits, remediation strategies, and accessibility automation.",
  openGraph: {
    title: "RegLayer Blog — Web Accessibility Insights",
    description: "Expert articles on WCAG compliance, EAA, ADA lawsuits, and accessibility automation.",
    url: "/blog",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
