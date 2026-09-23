import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Automation",
  "Configure automated remediation, scheduled scans, and monitoring for your sites.",
);

export default function AutomationLayout({ children }: { children: ReactNode }) {
  return children;
}
