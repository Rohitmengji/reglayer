import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Compliance",
  "Track conformance against WCAG, ADA, Section 508, and EN 301 549 across your workspace.",
);

export default function ComplianceLayout({ children }: { children: ReactNode }) {
  return children;
}
