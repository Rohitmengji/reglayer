import { DocsGuide, getGuideMetadata } from "@/components/docs/docs-article";

export const metadata = getGuideMetadata("integrations");

export default function IntegrationsPage() {
  return <DocsGuide slug="integrations" />;
}