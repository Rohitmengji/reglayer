import { publicMetadata } from "@/lib/seo";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";

export const metadata = publicMetadata("/blog", "Blog - Web Accessibility Insights", "Read articles on WCAG, accessibility testing, remediation, design, and web accessibility regulations.");

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <><PublicHeader /><main className="py-8">{children}</main><Footer /></>;
}
