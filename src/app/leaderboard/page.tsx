/**
 * RegLayer — Public Accessibility Leaderboard
 *
 * SEO-optimized public page showing top-scoring accessible websites.
 * No auth required. Generates organic traffic and social proof.
 */

import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Accessibility Leaderboard — Top Accessible Websites | RegLayer",
  description:
    "See which websites score highest on accessibility compliance. Real-time rankings based on WCAG scanning by RegLayer.",
  openGraph: {
    title: "Accessibility Leaderboard | RegLayer",
    description: "Top-scoring accessible websites ranked by real scan data.",
  },
};

interface LeaderboardEntry {
  rank: number;
  url: string;
  domain: string;
  name: string | null;
  score: number;
  bestScore: number;
  scans: number;
  improvement: number;
  lastScanned: string | null;
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/leaderboard?limit=50`, {
      next: { revalidate: 3600 }, // ISR: revalidate every hour
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.leaderboard || [];
  } catch {
    return [];
  }
}

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      {/* Hero */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-b from-blue-50 to-white dark:from-neutral-900 dark:to-neutral-950">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h1 className="text-4xl font-bold mb-3">
            🏆 Accessibility Leaderboard
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            Real-time rankings of the most accessible websites, verified by automated WCAG scanning.
          </p>
          <p className="text-sm text-neutral-500 mt-4">
            Powered by <Link href="/" className="text-blue-600 hover:underline font-medium">RegLayer</Link> — Web Accessibility Compliance Platform
          </p>
        </div>
      </header>

      {/* Leaderboard Table */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {leaderboard.length > 0 ? (
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[60px_1fr_100px_100px_100px] gap-2 px-4 py-3 bg-neutral-50 dark:bg-neutral-900 text-xs font-medium text-neutral-500 uppercase tracking-wide border-b border-neutral-200 dark:border-neutral-800">
              <span>Rank</span>
              <span>Website</span>
              <span className="text-right">Score</span>
              <span className="text-right">Best</span>
              <span className="text-right">Trend</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {leaderboard.map((entry) => (
                <div
                  key={entry.url}
                  className="grid grid-cols-[60px_1fr_100px_100px_100px] gap-2 px-4 py-3 items-center hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
                >
                  {/* Rank */}
                  <span className="font-bold text-lg">
                    {entry.rank <= 3 ? (
                      <span className={entry.rank === 1 ? "text-amber-500" : entry.rank === 2 ? "text-neutral-400" : "text-amber-700"}>
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                      </span>
                    ) : (
                      <span className="text-neutral-400">#{entry.rank}</span>
                    )}
                  </span>

                  {/* Site Info */}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {entry.name || entry.domain}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">{entry.url}</p>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <ScorePill score={entry.score} />
                  </div>

                  {/* Best Score */}
                  <span className="text-right text-sm font-medium">{entry.bestScore}</span>

                  {/* Improvement */}
                  <span className={`text-right text-sm font-medium ${
                    entry.improvement > 0
                      ? "text-emerald-600"
                      : entry.improvement < 0
                      ? "text-red-600"
                      : "text-neutral-400"
                  }`}>
                    {entry.improvement > 0 ? "+" : ""}{entry.improvement}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-neutral-500">
            <p className="text-lg">No leaderboard data yet.</p>
            <p className="text-sm mt-2">Sites appear after being scanned at least twice.</p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 text-center border border-neutral-200 dark:border-neutral-800 rounded-xl p-8 bg-gradient-to-b from-blue-50 to-white dark:from-neutral-900 dark:to-neutral-950">
          <h2 className="text-xl font-bold mb-2">Want your site on this leaderboard?</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            Scan your website for free and see how you rank against the most accessible sites on the web.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Scan Your Site Free →
          </a>
        </div>

        {/* SEO Content */}
        <div className="mt-12 prose dark:prose-invert max-w-none text-sm text-neutral-600 dark:text-neutral-400">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">About This Leaderboard</h2>
          <p>
            The RegLayer Accessibility Leaderboard ranks websites by their WCAG compliance score,
            measured through automated scanning with axe-core and Playwright. Scores range from 0 to 100,
            where 100 means zero detectable accessibility violations.
          </p>
          <p>
            Sites must be scanned at least twice to appear, ensuring scores are verified and consistent.
            Rankings update hourly based on the latest scan data.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 mt-16 py-8 text-center text-sm text-neutral-500">
        <p>© {new Date().getFullYear()} RegLayer. Accessibility Compliance Platform.</p>
      </footer>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 90
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : score >= 70
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-sm font-semibold ${color}`}>
      {score}
    </span>
  );
}
