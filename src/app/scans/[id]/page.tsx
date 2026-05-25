import { AppShell } from "@/components/layout/app-shell";

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Scan Details</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Detailed scan results and compliance report.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-500">
            Scan detail view — coming soon.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
