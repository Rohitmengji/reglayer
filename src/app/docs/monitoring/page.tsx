import { DocsGuide, getGuideMetadata } from "@/components/docs/docs-article";

export const metadata = getGuideMetadata("monitoring");

export default function MonitoringPage() {
  return <DocsGuide slug="monitoring" />;
}