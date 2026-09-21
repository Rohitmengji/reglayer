import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/pricing", "Pricing - Plans for Every Team", "Compare RegLayer Free, Pro, and Enterprise plans for automated WCAG scanning, monitoring, and accessibility reporting.");

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
