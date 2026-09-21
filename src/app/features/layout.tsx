import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/features", "Accessibility Testing Features", "Explore RegLayer's automated WCAG scans, monitoring, issue tracking, developer integrations, and accessibility reports.");

export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
