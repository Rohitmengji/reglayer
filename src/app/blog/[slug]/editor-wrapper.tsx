"use client";

import { useState } from "react";
import { ArticleEditor } from "@/components/blog/article-editor";
import type { ArticleContent } from "./content";

interface EditorWrapperProps {
  slug: string;
  article: ArticleContent;
  children: React.ReactNode;
}

export function ArticleEditorWrapper({ slug, article, children }: EditorWrapperProps) {
  const [currentArticle, setCurrentArticle] = useState({
    slug,
    title: article.title,
    excerpt: article.excerpt,
    content: { sections: article.sections },
  });
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <ArticleEditor
        article={currentArticle}
        onUpdate={(updated) => setCurrentArticle(updated)}
        onEditingChange={setIsEditing}
      />
      {!isEditing && children}
    </>
  );
}
