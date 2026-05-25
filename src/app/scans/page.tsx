import { AppShell } from "@/components/layout/app-shell";

export default function ScansPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Scan History</h1>
          <p className="mt-1 text-sm text-neutral-500">
            View and manage past accessibility scans.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-500">
            No scans recorded yet. Run your first scan from the Dashboard.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
