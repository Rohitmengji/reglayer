import type { ReactNode } from "react";
import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata(
  "Settings",
  "Manage your plan, account, API keys, integrations, alerts, and workspace preferences.",
);

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
