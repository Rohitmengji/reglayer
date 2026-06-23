import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Reference — RESTful Endpoints for Developers",
  description: "Complete API documentation for RegLayer. Scan, monitor, report, and manage accessibility compliance programmatically. Authentication, rate limits, and webhook configuration.",
  openGraph: {
    title: "RegLayer API Reference",
    description: "RESTful API for accessibility scanning, monitoring, and reporting. Full endpoint documentation with examples.",
    url: "/api-reference",
  },
};

export default function ApiReferenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
