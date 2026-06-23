import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How RegLayer collects, processes, and protects your data. GDPR-aligned privacy practices, data retention policies, and your rights as a user.",
  openGraph: {
    title: "RegLayer Privacy Policy",
    description: "GDPR-aligned data handling, retention policies, and user rights.",
    url: "/privacy",
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
