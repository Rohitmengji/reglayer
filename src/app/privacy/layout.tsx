import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/privacy", "Privacy Policy", "Read how RegLayer collects, processes, and protects data, including retention policies and your privacy rights.");

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
