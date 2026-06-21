"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { FileText, ArrowLeft, Plus } from "lucide-react";
import { isContentEditor } from "@/lib/auth/roles";

export default function BlogNotFound() {
  const { data: session } = useSession();
  const isAdmin = isContentEditor(session);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4 mb-4">
        <FileText className="h-8 w-8 text-neutral-400" />
      </div>
      <h1 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">Article not found</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-w-sm">
        This article doesn&apos;t exist yet or has been removed.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/blog"
          className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Blog
        </Link>
        {isAdmin && (
          <Link
            href="/blog/create"
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Article
          </Link>
        )}
      </div>
    </div>
  );
}
