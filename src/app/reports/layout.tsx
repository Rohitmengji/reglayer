import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Reports",
  "Generate and share accessibility compliance reports, trends, and audit-ready evidence.",
);

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return children;
}
