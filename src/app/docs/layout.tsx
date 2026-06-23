import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation — Getting Started & Guides",
  description: "Learn how to use RegLayer: scanning, monitoring, reports, API integration, team management, and CI/CD setup. Step-by-step guides for every feature.",
  openGraph: {
    title: "RegLayer Documentation",
    description: "Step-by-step guides for scanning, monitoring, reports, API integration, and CI/CD setup.",
    url: "/docs",
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
