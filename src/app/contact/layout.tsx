import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/contact", "Contact", "Contact the RegLayer team for product support, enterprise inquiries, partnerships, or bug reports.");

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
