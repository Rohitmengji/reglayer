import { privateMetadata } from "@/lib/seo";

export const metadata = privateMetadata("Account Access", "Sign in to your RegLayer account or manage account access.");

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}