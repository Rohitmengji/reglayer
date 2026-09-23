import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Manage Workspace",
  "Manage team members, roles, notifications, and workspace configuration.",
);

export default function ManageLayout({ children }: { children: ReactNode }) {
  return children;
}
