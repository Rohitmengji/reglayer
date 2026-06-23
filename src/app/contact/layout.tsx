import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact — Get in Touch",
  description: "Contact RegLayer for support, enterprise inquiries, partnerships, or bug reports. We respond within 24 hours on business days.",
  openGraph: {
    title: "Contact RegLayer",
    description: "Reach our team for support, enterprise sales, partnerships, or bug reports.",
    url: "/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
