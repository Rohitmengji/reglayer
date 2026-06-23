import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Plans for Every Team",
  description: "Free, Pro, and Enterprise plans for web accessibility compliance. Automated WCAG scanning, monitoring, and reporting. Start free, upgrade when ready.",
  openGraph: {
    title: "RegLayer Pricing — Plans for Every Team",
    description: "Free, Pro, and Enterprise plans for web accessibility compliance. Start free, upgrade when ready.",
    url: "/pricing",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
