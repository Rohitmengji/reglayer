import { DocsGuide, getGuideMetadata } from "@/components/docs/docs-article";

export const metadata = getGuideMetadata("getting-started");

export default function GettingStartedPage() {
  return <DocsGuide slug="getting-started" />;
}