"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Crown,
  Users,
  Building2,
  BarChart3,
  ChevronDown,
  Check,
  Plus,
  UserPlus,
  UserCheck,
  X,
  Trash2,
  KeyRound,
} from "lucide-react";

interface WorkspaceMemberInfo {
  id: string;
  role: string;
  user: { id: string; email: string; name: string | null; isMasterAdmin: boolean };
}

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  members: WorkspaceMemberInfo[];
  _count: { scans: number; schedules: number; sites: number };
}

interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  isMasterAdmin: boolean;
  createdAt: string;
}

interface AdminData {
  workspaces: WorkspaceInfo[];
  users: UserInfo[];
  stats: { totalWorkspaces: number; totalUsers: number; totalScans: number; totalSchedules: number };
}

const planColors: Record<string, string> = {
  FREE: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  PRO: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  ENTERPRISE: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
};

const roleColors: Record<string, string> = {
  OWNER: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  MEMBER: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  VIEWER: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedWorkspace, setExpandedWorkspace] = useState<string | null>(null);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsOwnerEmail, setNewWsOwnerEmail] = useState("");
  const [newWsPlan, setNewWsPlan] = useState("FREE");
  const [showAddUser, setShowAddUser] = useState<string | null>(null);
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserRole, setAddUserRole] = useState("MEMBER");
  const [resetPasswordUser, setResetPasswordUser] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [pendingRequests, setPendingRequests] = useState<{
    id: string;
    message: string | null;
    workspaceId: string | null;
    createdAt: string;
    user: { id: string; email: string; name: string | null; image: string | null };
  }[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const res = await fetch("/api/admin");
    if (res.status === 403) {
      router.push("/dashboard");
      return;
    }
    if (res.ok) {
      setData(await res.json());
    }
    // Fetch pending access requests
    const reqRes = await fetch("/api/access-request");
    if (reqRes.ok) {
      const reqData = await reqRes.json();
      setPendingRequests(reqData.requests || []);
    }
    setLoading(false);
  }

  async function handleChangePlan(workspaceId: string, plan: string) {
    setActionLoading(true);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "changePlan", workspaceId, plan }),
    });
    if (res.ok) {
      setChangingPlan(null);
      fetchData();
    }
    setActionLoading(false);
  }

  async function handleToggleMasterAdmin(userId: string) {
    setActionLoading(true);
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleMasterAdmin", userId }),
    });
    fetchData();
    setActionLoading(false);
  }

  async function handleChangeRole(workspaceId: string, targetUserId: string, role: string) {
    setActionLoading(true);
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assignRole", workspaceId, targetUserId, role }),
    });
    fetchData();
    setActionLoading(false);
  }

  async function handleRemoveUser(workspaceId: string, targetUserId: string) {
    setActionLoading(true);
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removeUser", workspaceId, targetUserId }),
    });
    fetchData();
    setActionLoading(false);
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newWsName || !newWsOwnerEmail) return;
    setActionLoading(true);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createWorkspace", name: newWsName, ownerEmail: newWsOwnerEmail, plan: newWsPlan }),
    });
    if (res.ok) {
      setShowCreateWorkspace(false);
      setNewWsName("");
      setNewWsOwnerEmail("");
      setNewWsPlan("FREE");
      fetchData();
    }
    setActionLoading(false);
  }

  async function handleAddUserToWorkspace(workspaceId: string) {
    if (!addUserEmail) return;
    setActionLoading(true);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addUserToWorkspace", workspaceId, email: addUserEmail, role: addUserRole }),
    });
    if (res.ok) {
      setShowAddUser(null);
      setAddUserEmail("");
      setAddUserRole("MEMBER");
      fetchData();
    }
    setActionLoading(false);
  }

  async function handleAccessRequest(requestId: string, action: "approve" | "deny", workspaceId?: string) {
    setActionLoading(true);
    await fetch("/api/access-request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, workspaceId, role: "MEMBER" }),
    });
    fetchData();
    setActionLoading(false);
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Permanently delete user "${email}"? This cannot be undone.`)) return;
    setActionLoading(true);
    await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteUser", userId }),
    });
    fetchData();
    setActionLoading(false);
  }

  async function handleResetPassword(userId: string) {
    if (!resetPasswordValue || resetPasswordValue.length < 6) return;
    setActionLoading(true);
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetPassword", userId, newPassword: resetPasswordValue }),
    });
    if (res.ok) {
      setResetPasswordUser(null);
      setResetPasswordValue("");
      alert("Password reset successfully");
    }
    setActionLoading(false);
  }

  if (loading || !data) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Master Admin Panel</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              System-wide control — manage workspaces, plans, and access
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Workspaces", value: data.stats.totalWorkspaces, icon: Building2 },
            { label: "Users", value: data.stats.totalUsers, icon: Users },
            { label: "Total Scans", value: data.stats.totalScans, icon: BarChart3 },
            { label: "Schedules", value: data.stats.totalSchedules, icon: Shield },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className="h-4 w-4 text-neutral-400" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{stat.label}</span>
                </div>
                <p className="text-2xl font-bold text-neutral-900 dark:text-white">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending Access Requests */}
        {pendingRequests.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-orange-500" /> Pending Requests
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-orange-100 dark:bg-orange-900/50 text-xs font-bold text-orange-700 dark:text-orange-300">
                {pendingRequests.length}
              </span>
            </h2>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-xs font-bold text-orange-600 dark:text-orange-300 shrink-0">
                          {(req.user.name || req.user.email)[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                            {req.user.name || req.user.email.split("@")[0]}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{req.user.email}</p>
                          {req.message && (
                            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 italic truncate">
                              &ldquo;{req.message}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          className="text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-neutral-700 dark:text-neutral-200"
                          defaultValue={data?.workspaces[0]?.id || ""}
                          id={`ws-select-${req.id}`}
                        >
                          {data?.workspaces.map((ws) => (
                            <option key={ws.id} value={ws.id}>{ws.name}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          className="text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={actionLoading}
                          onClick={() => {
                            const select = document.getElementById(`ws-select-${req.id}`) as HTMLSelectElement;
                            handleAccessRequest(req.id, "approve", select?.value);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-red-600 hover:text-red-700"
                          disabled={actionLoading}
                          onClick={() => handleAccessRequest(req.id, "deny")}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Users Section */}
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
            <Users className="h-5 w-5" /> All Users
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-neutral-300">
                        {(user.name || user.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900 dark:text-white">
                          {user.name || user.email.split("@")[0]}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.isMasterAdmin && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 text-xs">
                          <Crown className="h-3 w-3 mr-1" /> Master Admin
                        </Badge>
                      )}
                      {user.email !== session?.user?.email && (
                        <>
                          {/* Reset Password */}
                          {resetPasswordUser === user.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="New password"
                                value={resetPasswordValue}
                                onChange={(e) => setResetPasswordValue(e.target.value)}
                                className="w-28 rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-xs dark:bg-neutral-800 dark:text-neutral-100"
                              />
                              <Button
                                size="sm"
                                className="text-xs"
                                disabled={actionLoading || resetPasswordValue.length < 6}
                                onClick={() => handleResetPassword(user.id)}
                              >
                                Set
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs"
                                onClick={() => { setResetPasswordUser(null); setResetPasswordValue(""); }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => setResetPasswordUser(user.id)}
                              disabled={actionLoading}
                              title="Reset Password"
                            >
                              <KeyRound className="h-3 w-3 mr-1" /> Reset PW
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={user.isMasterAdmin ? "destructive" : "outline"}
                            onClick={() => handleToggleMasterAdmin(user.id)}
                            disabled={actionLoading}
                            className="text-xs"
                          >
                            {user.isMasterAdmin ? "Revoke Master" : "Grant Master"}
                          </Button>
                          {/* Delete User */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            disabled={actionLoading}
                            title="Delete User"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workspaces Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Building2 className="h-5 w-5" /> All Workspaces
            </h2>
            <Button
              size="sm"
              onClick={() => setShowCreateWorkspace(!showCreateWorkspace)}
              className="text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Create Workspace
            </Button>
          </div>

          {/* Create Workspace Form */}
          {showCreateWorkspace && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <form onSubmit={handleCreateWorkspace} className="space-y-3">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">New Workspace</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Workspace name"
                      value={newWsName}
                      onChange={(e) => setNewWsName(e.target.value)}
                      required
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <input
                      type="email"
                      placeholder="Owner email"
                      value={newWsOwnerEmail}
                      onChange={(e) => setNewWsOwnerEmail(e.target.value)}
                      required
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <select
                      value={newWsPlan}
                      onChange={(e) => setNewWsPlan(e.target.value)}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                    >
                      <option value="FREE">Free</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={actionLoading} className="text-xs">
                      Create
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreateWorkspace(false)} className="text-xs">
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <div className="space-y-3">
            {data.workspaces.map((ws) => (
              <Card key={ws.id}>
                <CardContent className="p-4">
                  {/* Workspace header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900 dark:text-white">{ws.name}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {ws._count.sites} sites · {ws._count.scans} scans · {ws._count.schedules} schedules
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Plan switcher */}
                      {changingPlan === ws.id ? (
                        <div className="flex items-center gap-1">
                          {["FREE", "PRO", "ENTERPRISE"].map((plan) => (
                            <Button
                              key={plan}
                              size="sm"
                              variant={ws.plan === plan ? "default" : "outline"}
                              onClick={() => handleChangePlan(ws.id, plan)}
                              disabled={actionLoading || ws.plan === plan}
                              className="text-xs px-2 py-1"
                            >
                              {ws.plan === plan && <Check className="h-3 w-3 mr-1" />}
                              {plan}
                            </Button>
                          ))}
                          <Button size="sm" variant="ghost" onClick={() => setChangingPlan(null)} className="text-xs">
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Badge className={`text-xs ${planColors[ws.plan]}`}>{ws.plan}</Badge>
                          <Button size="sm" variant="outline" onClick={() => setChangingPlan(ws.id)} className="text-xs">
                            Change Plan
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedWorkspace(expandedWorkspace === ws.id ? null : ws.id)}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedWorkspace === ws.id ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  {/* Members (expanded) */}
                  {expandedWorkspace === ws.id && (
                    <div className="mt-4 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                          Members ({ws.members.length})
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => setShowAddUser(showAddUser === ws.id ? null : ws.id)}
                        >
                          <UserPlus className="h-3 w-3 mr-1" /> Add User
                        </Button>
                      </div>

                      {/* Add User Form */}
                      {showAddUser === ws.id && (
                        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                          <input
                            type="email"
                            placeholder="user@email.com"
                            value={addUserEmail}
                            onChange={(e) => setAddUserEmail(e.target.value)}
                            className="flex-1 rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1.5 text-xs dark:bg-neutral-800 dark:text-neutral-100"
                          />
                          <select
                            value={addUserRole}
                            onChange={(e) => setAddUserRole(e.target.value)}
                            className="rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1.5 text-xs dark:bg-neutral-800 dark:text-neutral-100"
                          >
                            <option value="OWNER">Owner</option>
                            <option value="ADMIN">Admin</option>
                            <option value="MEMBER">Member</option>
                            <option value="VIEWER">Viewer</option>
                          </select>
                          <Button
                            size="sm"
                            className="text-xs"
                            onClick={() => handleAddUserToWorkspace(ws.id)}
                            disabled={actionLoading || !addUserEmail}
                          >
                            Add
                          </Button>
                        </div>
                      )}
                      <div className="space-y-2">
                        {ws.members.map((member) => (
                          <div key={member.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-neutral-700 dark:text-neutral-200">
                                {member.user.name || member.user.email}
                              </span>
                              <Badge className={`text-xs ${roleColors[member.role]}`}>{member.role}</Badge>
                              {member.user.isMasterAdmin && (
                                <Crown className="h-3 w-3 text-amber-500" />
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <select
                                className="text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-neutral-700 dark:text-neutral-200"
                                value={member.role}
                                onChange={(e) => handleChangeRole(ws.id, member.user.id, e.target.value)}
                                disabled={actionLoading}
                              >
                                <option value="OWNER">Owner</option>
                                <option value="ADMIN">Admin</option>
                                <option value="MEMBER">Member</option>
                                <option value="VIEWER">Viewer</option>
                              </select>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-red-600 hover:text-red-700 px-2"
                                onClick={() => handleRemoveUser(ws.id, member.user.id)}
                                disabled={actionLoading}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
