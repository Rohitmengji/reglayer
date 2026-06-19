/**
 * Dashboard loading state — centered spinner while JS bundle downloads and
 * auth resolves. Skeleton shimmer appears later inside the page component
 * during data fetching. Modern pattern: spinner → skeleton → content.
 */
import { InitialSpinner } from "@/components/ui/initial-spinner";

export default function DashboardLoading() {
  return <InitialSpinner message="Loading dashboard..." />;
}
