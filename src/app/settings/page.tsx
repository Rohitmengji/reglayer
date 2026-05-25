import { AppShell } from "@/components/layout/app-shell";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Configure scanner behavior and compliance rules.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-500">
            Settings panel — coming soon.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
