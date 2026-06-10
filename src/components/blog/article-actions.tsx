"use client";

import { useState, useEffect, useRef } from "react";
import { Share2, BookmarkPlus, BookmarkCheck, Link2, Mail } from "lucide-react";
import { toast } from "sonner";

function getInitialBookmark(slug: string): boolean {
  if (typeof window === "undefined") return false;
  const bookmarks: string[] = JSON.parse(localStorage.getItem("reglayer-bookmarks") || "[]");
  return bookmarks.includes(slug);
}

interface ArticleActionsProps {
  title: string;
  slug: string;
}

export function ArticleActions({ title, slug }: ArticleActionsProps) {
  const [bookmarked, setBookmarked] = useState(() => getInitialBookmark(slug));
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    }
    if (shareOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [shareOpen]);

  function getArticleUrl() {
    return `${window.location.origin}/blog/${slug}`;
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(getArticleUrl());
    toast.success("Link copied to clipboard");
    setShareOpen(false);
  }

  function handleShareTwitter() {
    const url = getArticleUrl();
    const text = encodeURIComponent(title);
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareOpen(false);
  }

  function handleShareLinkedIn() {
    const url = getArticleUrl();
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareOpen(false);
  }

  function handleShareEmail() {
    const url = getArticleUrl();
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`Check out this article: ${url}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setShareOpen(false);
  }

  function handleBookmark() {
    const key = "reglayer-bookmarks";
    const bookmarks: string[] = JSON.parse(localStorage.getItem(key) || "[]");
    if (bookmarks.includes(slug)) {
      localStorage.setItem(key, JSON.stringify(bookmarks.filter((b) => b !== slug)));
      setBookmarked(false);
      toast("Article removed from bookmarks");
    } else {
      localStorage.setItem(key, JSON.stringify([...bookmarks, slug]));
      setBookmarked(true);
      toast.success("Article bookmarked");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Share dropdown */}
      <div className="relative" ref={shareRef}>
        <button
          onClick={() => setShareOpen(!shareOpen)}
          className="p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Share article"
          aria-expanded={shareOpen}
        >
          <Share2 className="h-4 w-4" />
        </button>

        {shareOpen && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-1">
              <button
                onClick={handleCopyLink}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Link2 className="h-4 w-4" />
                Copy link
              </button>
              <button
                onClick={handleShareTwitter}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Share on X
              </button>
              <button
                onClick={handleShareLinkedIn}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                Share on LinkedIn
              </button>
              <button
                onClick={handleShareEmail}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Mail className="h-4 w-4" />
                Send via email
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bookmark */}
      <button
        onClick={handleBookmark}
        className={`p-2 rounded-lg transition-colors ${
          bookmarked
            ? "text-accent bg-accent/10"
            : "text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
        aria-label={bookmarked ? "Remove bookmark" : "Bookmark article"}
        aria-pressed={bookmarked}
      >
        {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
      </button>
    </div>
  );
}
