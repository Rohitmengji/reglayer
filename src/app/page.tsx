import { redirect } from "next/navigation";

/**
 * Root page redirects to dashboard.
 * The dashboard is the primary interface for RegLayer.
 */
export default function Home() {
  redirect("/dashboard");
}
