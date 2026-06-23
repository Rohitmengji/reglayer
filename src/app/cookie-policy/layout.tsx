import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How RegLayer uses cookies: authentication, preferences, and analytics. Understand each cookie's purpose, duration, and how to manage your preferences.",
  openGraph: {
    title: "RegLayer Cookie Policy",
    description: "Cookie usage, purposes, and preference management.",
    url: "/cookie-policy",
  },
};

export default function CookiePolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
