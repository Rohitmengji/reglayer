import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Violations",
  "Review, filter, and prioritise the accessibility violations found across your monitored sites.",
);

export default function ViolationsLayout({ children }: { children: ReactNode }) {
  return children;
}
