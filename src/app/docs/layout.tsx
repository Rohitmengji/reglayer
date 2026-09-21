import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/docs", "Documentation and Guides", "Learn to use RegLayer for accessibility scanning, monitoring, reports, API integration, team management, and CI/CD workflows.");

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
