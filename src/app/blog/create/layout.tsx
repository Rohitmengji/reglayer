import { PRIVATE_ROBOTS } from "@/lib/seo";

export const metadata = { title: "Create Article", robots: PRIVATE_ROBOTS, alternates: { canonical: null } };

export default function CreateArticleLayout({ children }: { children: React.ReactNode }) {
  return children;
}