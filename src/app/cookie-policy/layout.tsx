import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/cookie-policy", "Cookie Policy", "Learn which cookies RegLayer uses for authentication, preferences, and analytics, and how to manage your choices.");

export default function CookiePolicyLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
