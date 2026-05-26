import type { MetadataRoute } from "next";

/**
 * Web Application Manifest — enables PWA install prompts and mobile app-like behavior.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RegLayer — Accessibility Scanner",
    short_name: "RegLayer",
    description: "Developer-native compliance infrastructure for WCAG accessibility scanning.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
