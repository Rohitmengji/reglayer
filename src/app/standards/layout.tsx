import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/standards", "Web Accessibility Standards", "Learn about WCAG, ADA, EAA, Section 508, and AODA, and how RegLayer maps automated findings to accessibility criteria.");

export default function StandardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
