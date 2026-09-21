import { DocsGuide, getGuideMetadata } from "@/components/docs/docs-article";

export const metadata = getGuideMetadata("reports");

export default function ReportsPage() {
  return <DocsGuide slug="reports" />;
}