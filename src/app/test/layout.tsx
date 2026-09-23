import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Testing",
  "Run accessibility scans, crawls, and manual test sessions against your sites.",
);

export default function TestLayout({ children }: { children: ReactNode }) {
  return children;
}
