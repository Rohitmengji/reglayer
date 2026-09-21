import { DocsGuide, getGuideMetadata } from "@/components/docs/docs-article";

export const metadata = getGuideMetadata("scanning");

export default function ScanningPage() {
  return <DocsGuide slug="scanning" />;
}