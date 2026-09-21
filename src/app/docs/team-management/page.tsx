import { DocsGuide, getGuideMetadata } from "@/components/docs/docs-article";

export const metadata = getGuideMetadata("team-management");

export default function TeamManagementPage() {
  return <DocsGuide slug="team-management" />;
}