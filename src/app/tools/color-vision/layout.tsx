import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/tools/color-vision", "Color Vision Simulator", "Explore how colors may appear with different color-vision deficiencies using RegLayer's browser-based simulation tool.");

export default function ColorVisionLayout({ children }: { children: React.ReactNode }) {
  return children;
}