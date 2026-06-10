"use client";

import { useState } from "react";
import { ArticleEditor } from "@/components/blog/article-editor";
import type { ArticleContent } from "./content";

interface EditorWrapperProps {
  slug: string;
  article: ArticleContent;
}

export function ArticleEditorWrapper({ slug, article }: EditorWrapperProps) {
  const [currentArticle, setCurrentArticle] = useState({
    slug,
    title: article.title,
    excerpt: article.excerpt,
    content: { sections: article.sections },
  });

  return (
    <ArticleEditor
      article={currentArticle}
      onUpdate={(updated) => setCurrentArticle(updated)}
    />
  );
}
