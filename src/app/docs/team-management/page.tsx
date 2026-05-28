/**
 * RegLayer — Team Management Documentation
 *
 * WHY: Workspace admins need docs on roles, permissions, and member management.
 * WHAT: Explains roles (Owner/Admin/Member/Viewer), invitation flow, RBAC permissions.
 * HOW: Static docs page with permission matrix table.
 */
import { Shield, Users, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Team Management — RegLayer Docs",
  description: "Manage workspace members with role-based access control and collaboration features.",
};

export default function TeamManagementPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <Link href="/docs" className="inline-flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Documentation
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <Users className="h-7 w-7 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Team Management</h1>
        </div>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          Collaborate with your team using role-based access control. Invite members, assign work, and manage permissions.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Roles & Permissions</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed">
              Each workspace member has a role that determines what they can do:
            </p>
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Role</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Permissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-600 dark:text-neutral-300">
                  <tr>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Owner</td>
                    <td className="px-4 py-3">Full access. Manage billing, delete workspace, transfer ownership.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Admin</td>
                    <td className="px-4 py-3">Manage members, settings, integrations. Run scans, export reports.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Member</td>
                    <td className="px-4 py-3">Run scans, view results, export reports. Cannot manage settings or members.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Viewer</td>
                    <td className="px-4 py-3">View-only access. Can see scan results and reports but cannot initiate scans.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Inviting Members</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Owners and Admins can invite new members to the workspace:
            </p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-2">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                Go to <strong>Team</strong> in the sidebar
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                Click <strong>Invite Member</strong> and enter their email
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                Choose a role (Admin, Member, or Viewer)
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                They&apos;ll sign in with Google and land in the workspace
              </li>
            </ul>
            <div className="mt-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong>Note:</strong> Users without workspace access will see the Request Access page and can submit a request that Admins can approve.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Workspace Settings</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3 leading-relaxed">
              Configure workspace-level preferences from <strong>Settings</strong>:
            </p>
            <ul className="text-sm text-neutral-600 dark:text-neutral-300 space-y-1 list-disc list-inside">
              <li>Default scan standard (WCAG 2.1 AA, EN 301 549, Section 508)</li>
              <li>Notification preferences (email digest frequency)</li>
              <li>Score threshold for alerts</li>
              <li>API key management</li>
              <li>Plan and billing (Owner only)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Plan Limits</h2>
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Feature</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Free</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Pro</th>
                    <th className="text-left px-4 py-2 font-medium text-neutral-900 dark:text-white">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-600 dark:text-neutral-300">
                  <tr>
                    <td className="px-4 py-2">Team members</td>
                    <td className="px-4 py-2">3</td>
                    <td className="px-4 py-2">20</td>
                    <td className="px-4 py-2">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Monitored sites</td>
                    <td className="px-4 py-2">5</td>
                    <td className="px-4 py-2">50</td>
                    <td className="px-4 py-2">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Scans per day</td>
                    <td className="px-4 py-2">10</td>
                    <td className="px-4 py-2">100</td>
                    <td className="px-4 py-2">Custom</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">Audit log retention</td>
                    <td className="px-4 py-2">90 days</td>
                    <td className="px-4 py-2">1 year</td>
                    <td className="px-4 py-2">Custom</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-3">Next Steps</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/docs/integrations" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Integrations →</p>
                <p className="text-xs text-neutral-500 mt-1">Connect to CI/CD and external tools</p>
              </Link>
              <Link href="/docs/getting-started" className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 transition-colors">
                <p className="font-medium text-sm text-neutral-900 dark:text-white">Getting Started →</p>
                <p className="text-xs text-neutral-500 mt-1">Back to the basics</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
