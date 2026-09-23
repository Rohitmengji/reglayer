import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Workflows",
  "Build and manage automated accessibility workflows for your workspace.",
);

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return children;
}
