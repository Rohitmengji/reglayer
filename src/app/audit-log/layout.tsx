import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Audit Log",
  "Review the record of actions taken in your workspace for security and compliance auditing.",
);

export default function AuditLogLayout({ children }: { children: ReactNode }) {
  return children;
}
