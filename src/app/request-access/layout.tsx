import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Request Workspace Access", "Request access to your organization's RegLayer workspace.");

export default function RequestAccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}