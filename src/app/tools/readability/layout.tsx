import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata("/tools/readability", "Text Readability Analyzer", "Assess text readability, sentence length, and reading level with RegLayer's free browser-based readability analyzer.");

export default function ReadabilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}