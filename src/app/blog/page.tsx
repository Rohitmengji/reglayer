import BlogList from "./blog-list";
import { getPublicArticleSummaries } from "@/lib/blog/public-articles";

export default async function BlogPage() {
  return <BlogList articles={await getPublicArticleSummaries()} />;
}