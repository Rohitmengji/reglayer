import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/tools/contrast", "Color Contrast Checker", "Check foreground and background color contrast ratios against WCAG AA and AAA thresholds for text and interface elements.");

export default function ContrastLayout({ children }: { children: React.ReactNode }) {
  return children;
}