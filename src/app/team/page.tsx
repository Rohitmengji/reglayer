"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Shield, Crown, Trash2, ChevronDown, KeyRound, X } from "lucide-react";

interface TeamMember {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  isMasterAdmin?: boolean;
  joinedAt: string;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

const roleColors: Record<string, string> = {
  MASTER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  OWNER: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  MEMBER: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  VIEWER: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

const roleIcons: Record<string, typeof Shield> = {
  OWNER: Crown,
  ADMIN: Shield,
  MEMBER: Users,
  VIEWER: Users,
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [resetPwUser, setResetPwUser] = useState<string | null>(null);
  const [resetPwValue, setResetPwValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/team")
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setMembers(data.members || []);
        setWorkspace(data.workspace);
        setCurrentUserRole(data.currentUserRole || "");
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError("");
    const toastId = toast.loading("Inviting member...");
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to invite");
        toast.error(data.error || "Failed to invite member", { id: toastId });
        return;
      }
      toast.success(`${inviteEmail} invited as ${inviteRole}`, { id: toastId });
      setMembers([...members, data]);
      setInviteEmail("");
      setShowInvite(false);
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    const toastId = toast.loading("Updating role...");
    const res = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, role: newRole }),
    });
    if (res.ok) {
      toast.success(`Role changed to ${newRole}`, { id: toastId });
      setMembers(members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to change role", { id: toastId });
    }
  }

  async function handleRemove(memberId: string, email: string) {
    if (!confirm(`Remove ${email} from the team?`)) return;
    const toastId = toast.loading("Removing member...");
    const res = await fetch(`/api/team?id=${memberId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${email} removed from team`, { id: toastId });
      setMembers(members.filter((m) => m.id !== memberId));
    } else {
      toast.error("Failed to remove member", { id: toastId });
    }
  }

  async function handleResetPassword(userId: string) {
    if (!resetPwValue || resetPwValue.length < 6) return;
    const toastId = toast.loading("Resetting password...");
    const res = await fetch("/api/team", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, newPassword: resetPwValue }),
    });
    if (res.ok) {
      toast.success("Password reset successfully", { id: toastId });
      setResetPwUser(null);
      setResetPwValue("");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to reset password", { id: toastId });
    }
  }

  async function handleChangePlan(newPlan: string) {
    if (!workspace || workspace.plan === newPlan) return;
    const toastId = toast.loading("Updating plan...");
    const res = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: newPlan }),
    });
    if (res.ok) {
      toast.success(`Plan upgraded to ${newPlan}`, { id: toastId });
      setWorkspace({ ...workspace, plan: newPlan });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to change plan", { id: toastId });
    }
  }

  const isAdmin = ["OWNER", "ADMIN"].includes(currentUserRole);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Team</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Manage workspace members and their access levels.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Invite Member
            </button>
          )}
        </div>

        {/* Workspace Info */}
        {workspace && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 p-2">
                    <Users className="h-5 w-5 text-neutral-600 dark:text-neutral-300" />
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-900 dark:text-white">{workspace.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{workspace.slug} · {members.length} member{members.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                {isAdmin ? (
                  <select
                    value={workspace.plan}
                    onChange={(e) => handleChangePlan(e.target.value)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-semibold dark:bg-neutral-800 dark:text-neutral-100 cursor-pointer"
                  >
                    <option value="FREE">FREE</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                ) : (
                  <Badge variant={workspace.plan === "ENTERPRISE" ? "success" : workspace.plan === "PRO" ? "default" : "secondary"}>
                    {workspace.plan}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invite Form */}
        {showInvite && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Invite Team Member
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting}
                  className="rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 transition-colors"
                >
                  {inviting ? "Inviting..." : "Send Invite"}
                </button>
              </form>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </CardContent>
          </Card>
        )}

        {/* Members List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-neutral-500 py-8 text-center">Loading team...</p>
            ) : members.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
                <p className="text-sm text-neutral-500 dark:text-neutral-400">No team members yet.</p>
                <p className="text-xs text-neutral-400 mt-1">Invite colleagues to collaborate on accessibility compliance.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {members.map((member) => {
                  const displayRole = member.isMasterAdmin ? "MASTER_ADMIN" : member.role;
                  const displayLabel = member.isMasterAdmin ? "MASTER ADMIN" : member.role;
                  const RoleIcon = member.isMasterAdmin ? Crown : (roleIcons[member.role] || Users);
                  return (
                    <div key={member.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                          <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                            {(member.name || member.email)[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {member.name || member.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 hidden sm:block">
                          {new Date(member.joinedAt).toLocaleDateString()}
                        </span>

                        {isAdmin && member.role !== "OWNER" && !member.isMasterAdmin ? (
                          <div className="relative">
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.id, e.target.value)}
                              className={`appearance-none rounded-full px-2.5 py-1 text-xs font-semibold border-none cursor-pointer pr-6 ${roleColors[member.role]}`}
                            >
                              <option value="VIEWER">Viewer</option>
                              <option value="MEMBER">Member</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" />
                          </div>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${roleColors[displayRole]}`}>
                            <RoleIcon className="h-3 w-3" />
                            {displayLabel}
                          </span>
                        )}

                        {isAdmin && member.role !== "OWNER" && !member.isMasterAdmin && (
                          <div className="flex items-center gap-1">
                            {resetPwUser === member.userId ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="New password"
                                  value={resetPwValue}
                                  onChange={(e) => setResetPwValue(e.target.value)}
                                  className="w-24 rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-xs dark:bg-neutral-800 dark:text-neutral-100"
                                />
                                <button
                                  onClick={() => handleResetPassword(member.userId)}
                                  disabled={resetPwValue.length < 6}
                                  className="rounded-md px-2 py-1 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  Set
                                </button>
                                <button
                                  onClick={() => { setResetPwUser(null); setResetPwValue(""); }}
                                  className="rounded-md p-1 text-neutral-400 hover:text-neutral-600"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setResetPwUser(member.userId)}
                                className="rounded-md p-1.5 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                                title="Reset Password"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleRemove(member.id, member.email)}
                              className="rounded-md p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role Descriptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { role: "Owner", desc: "Full access, billing, can delete workspace", color: "border-amber-200 dark:border-amber-800" },
                { role: "Admin", desc: "Manage team, settings, all scans", color: "border-blue-200 dark:border-blue-800" },
                { role: "Member", desc: "Run scans, view reports, manage own data", color: "border-neutral-200 dark:border-neutral-700" },
                { role: "Viewer", desc: "View reports and analytics only", color: "border-neutral-200 dark:border-neutral-700" },
              ].map((r) => (
                <div key={r.role} className={`rounded-lg border ${r.color} p-3`}>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{r.role}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{r.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
