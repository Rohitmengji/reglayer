import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/tools", "Free Accessibility Tools", "Check color contrast, explore color-vision simulations, and assess text readability with RegLayer's free browser-based tools.");

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}