import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Marketplace",
  "Discover and install community workflows, rules, agents, and templates, or publish your own to share with your team.",
);

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return children;
}
