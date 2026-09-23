import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Dashboard",
  "Your accessibility compliance overview: scan activity, average score, open violations, and monitored sites.",
);

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
