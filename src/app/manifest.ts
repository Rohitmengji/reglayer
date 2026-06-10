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
    name: "RegLayer — Web Accessibility Compliance Platform",
    short_name: "RegLayer",
    description: "Enterprise accessibility compliance platform. Automated WCAG scanning, litigation risk scoring, and continuous monitoring.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111827",
    orientation: "portrait-primary",
    categories: ["productivity", "developer", "business"],
    icons: [
      {
        src: "/assests/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/assests/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/assests/favicon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/assests/apple-touch-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
