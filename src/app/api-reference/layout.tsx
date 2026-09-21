import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/api-reference", "API Reference", "Explore RegLayer API endpoints for accessibility scans and reports, with authentication, rate limits, and request examples.");

export default function ApiReferenceLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
