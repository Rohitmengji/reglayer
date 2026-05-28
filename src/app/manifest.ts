/**
 * RegLayer — Web App Manifest
 *
 * WHY: PWA support — allows users to "install" RegLayer on their device.
 * WHAT: Returns JSON manifest with app name, icons, theme color, display mode.
 * HOW: Next.js Metadata API generates /manifest.webmanifest from this export.
 */
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
