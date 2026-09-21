import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/terms", "Terms of Service", "Read the terms governing RegLayer, including acceptable use, billing, intellectual property, and liability.");

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
