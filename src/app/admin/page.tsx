"use client";

/**
 * RegLayer — Master Admin Panel
 *
 * WHY: Platform administrators need to manage all users, plans, and credits.
 * WHAT: User list with plan/credit info, grant credits button, change plan, view access requests.
 * HOW: Fetches /api/admin. Only accessible by users with isMasterAdmin=true. RBAC enforced server-side.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  Coins,
  Search,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModernSelect } from "@/components/ui/modern-select";

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
  role: string | null;
  canGrantMaster: boolean;
  bonusCredits: number;
  creditGrantsThisMonth: number;
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
  const [wsSelections, setWsSelections] = useState<Record<string, string>>({});
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsOwnerEmail, setNewWsOwnerEmail] = useState("");
  const [newWsPlan, setNewWsPlan] = useState("FREE");
  const [showAddUser, setShowAddUser] = useState<string | null>(null);
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserRole, setAddUserRole] = useState("MEMBER");
  const [resetPasswordUser, setResetPasswordUser] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [grantCreditsUser, setGrantCreditsUser] = useState<string | null>(null);
  const [grantCreditsAmount, setGrantCreditsAmount] = useState("");
  const [grantCreditsReason, setGrantCreditsReason] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("ALL");
  const { t } = useI18n();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const toastId = toast.loading("Changing plan...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "changePlan", workspaceId, plan }),
    });
    if (res.ok) {
      toast.success(`Plan changed to ${plan}`, { id: toastId });
      setChangingPlan(null);
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to change plan", { id: toastId });
    }
    setActionLoading(false);
  }

  async function handleToggleMasterAdmin(userId: string) {
    setActionLoading(true);
    const toastId = toast.loading("Updating admin status...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleMasterAdmin", userId }),
    });
    if (res.ok) {
      toast.success("Admin status updated", { id: toastId });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to update", { id: toastId });
    }
    fetchData();
    setActionLoading(false);
  }

  async function handleChangeRole(workspaceId: string, targetUserId: string, role: string) {
    setActionLoading(true);
    const toastId = toast.loading("Updating role...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assignRole", workspaceId, targetUserId, role }),
    });
    if (res.ok) {
      toast.success(`Role changed to ${role}`, { id: toastId });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to change role", { id: toastId });
    }
    fetchData();
    setActionLoading(false);
  }

  async function handleRemoveUser(workspaceId: string, targetUserId: string) {
    setActionLoading(true);
    const toastId = toast.loading("Removing user...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removeUser", workspaceId, targetUserId }),
    });
    if (res.ok) {
      toast.success("User removed from workspace", { id: toastId });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to remove user", { id: toastId });
    }
    fetchData();
    setActionLoading(false);
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newWsName || !newWsOwnerEmail) return;
    setActionLoading(true);
    const toastId = toast.loading("Creating workspace...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createWorkspace", name: newWsName, ownerEmail: newWsOwnerEmail, plan: newWsPlan }),
    });
    if (res.ok) {
      toast.success(`Workspace "${newWsName}" created`, { id: toastId });
      setShowCreateWorkspace(false);
      setNewWsName("");
      setNewWsOwnerEmail("");
      setNewWsPlan("FREE");
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create workspace", { id: toastId });
    }
    setActionLoading(false);
  }

  async function handleAddUserToWorkspace(workspaceId: string) {
    if (!addUserEmail) return;
    setActionLoading(true);
    const toastId = toast.loading("Adding user...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addUserToWorkspace", workspaceId, email: addUserEmail, role: addUserRole }),
    });
    if (res.ok) {
      toast.success(`${addUserEmail} added to workspace`, { id: toastId });
      setShowAddUser(null);
      setAddUserEmail("");
      setAddUserRole("MEMBER");
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to add user", { id: toastId });
    }
    setActionLoading(false);
  }

  async function handleAccessRequest(requestId: string, action: "approve" | "deny", workspaceId?: string) {
    setActionLoading(true);
    const toastId = toast.loading(action === "approve" ? "Approving request..." : "Denying request...");
    const res = await fetch("/api/access-request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action, workspaceId, role: "MEMBER" }),
    });
    if (res.ok) {
      toast.success(action === "approve" ? "Request approved — user now has access" : "Request denied", { id: toastId });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to process request", { id: toastId });
    }
    fetchData();
    setActionLoading(false);
  }

  const [deleteUserTarget, setDeleteUserTarget] = useState<{ id: string; email: string } | null>(null);

  async function handleDeleteUser(userId: string, email: string) {
    setActionLoading(true);
    const toastId = toast.loading("Deleting user...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteUser", userId }),
    });
    if (res.ok) {
      toast.success(`User "${email}" deleted`, { id: toastId });
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to delete user", { id: toastId });
    }
    fetchData();
    setActionLoading(false);
  }

  async function handleGrantCredits(userId: string) {
    const amount = parseInt(grantCreditsAmount, 10);
    if (!amount || amount < 1 || amount > 500) {
      toast.error("Amount must be between 1 and 500");
      return;
    }
    setActionLoading(true);
    const toastId = toast.loading("Granting AI credits...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grantCredits", userId, amount, reason: grantCreditsReason || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      toast.success(`Granted ${amount} credits (total bonus: ${data.bonusCredits})`, { id: toastId });
      setGrantCreditsUser(null);
      setGrantCreditsAmount("");
      setGrantCreditsReason("");
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to grant credits", { id: toastId });
    }
    setActionLoading(false);
  }

  async function handleResetPassword(userId: string) {
    if (!resetPasswordValue || resetPasswordValue.length < 6) return;
    setActionLoading(true);
    const toastId = toast.loading("Resetting password...");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetPassword", userId, newPassword: resetPasswordValue }),
    });
    if (res.ok) {
      toast.success("Password reset successfully", { id: toastId });
      setResetPasswordUser(null);
      setResetPasswordValue("");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to reset password", { id: toastId });
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
          <div className="h-10 w-10 rounded-lg bg-linear-to-br from-red-500 to-orange-600 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("admin.title")}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("admin.subtitle")}
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("admin.workspaces"), value: data.stats.totalWorkspaces, icon: Building2 },
            { label: t("admin.users"), value: data.stats.totalUsers, icon: Users },
            { label: t("admin.totalScans"), value: data.stats.totalScans, icon: BarChart3 },
            { label: t("admin.schedules"), value: data.stats.totalSchedules, icon: Shield },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
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
              <UserCheck className="h-5 w-5 text-orange-500" /> {t("admin.pendingRequests")}
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-orange-100 dark:bg-orange-900/50 text-xs font-bold text-orange-700 dark:text-orange-300">
                {pendingRequests.length}
              </span>
            </h2>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3">
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
                            <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-0.5 italic truncate">
                              &ldquo;{req.message}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 pl-11 sm:pl-0">
                        <ModernSelect
                          options={(data?.workspaces || []).map((ws) => ({ value: ws.id, label: ws.name }))}
                          value={wsSelections[req.id] || data?.workspaces[0]?.id || ""}
                          onChange={(v) => setWsSelections((prev) => ({ ...prev, [req.id]: v }))}
                        />
                        <Button
                          size="sm"
                          className="text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={actionLoading}
                          onClick={() => {
                            handleAccessRequest(req.id, "approve", wsSelections[req.id] || data?.workspaces[0]?.id);
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" /> {t("admin.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
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

        {/* Grant Credits Modal */}
        {grantCreditsUser && (() => {
          const targetUser = data.users.find((u) => u.id === grantCreditsUser);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Grant AI Credits" onClick={() => { setGrantCreditsUser(null); setGrantCreditsAmount(""); setGrantCreditsReason(""); }}>
              <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-xl shadow-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-500" /> Grant AI Credits
                  </h3>
                  <button onClick={() => { setGrantCreditsUser(null); setGrantCreditsAmount(""); setGrantCreditsReason(""); }} className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="text-sm text-neutral-600 dark:text-neutral-300">
                  <p>User: <span className="font-medium">{targetUser?.name || targetUser?.email}</span></p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Current bonus: {targetUser?.bonusCredits ?? 0} · Grants this month: {targetUser?.creditGrantsThisMonth ?? 0}/3
                  </p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Amount (1–500)</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      placeholder="e.g. 100"
                      value={grantCreditsAmount}
                      onChange={(e) => setGrantCreditsAmount(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">Reason (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Customer support escalation"
                      value={grantCreditsReason}
                      onChange={(e) => setGrantCreditsReason(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{3 - (targetUser?.creditGrantsThisMonth ?? 0)} grants remaining this month</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setGrantCreditsUser(null); setGrantCreditsAmount(""); setGrantCreditsReason(""); }}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={actionLoading || !grantCreditsAmount || (targetUser?.creditGrantsThisMonth ?? 0) >= 3}
                      onClick={() => handleGrantCredits(grantCreditsUser)}
                    >
                      <Coins className="h-3 w-3 mr-1" /> Grant Credits
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Users Section */}
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
            <Users className="h-5 w-5" /> {t("admin.allUsers")}
          </h2>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm dark:bg-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {["ALL", "MASTER_ADMIN", "OWNER", "ADMIN", "MEMBER", "VIEWER"].map((role) => (
                <button
                  key={role}
                  onClick={() => setUserRoleFilter(role)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    userRoleFilter === role
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  }`}
                >
                  {role === "ALL" ? "All" : role === "MASTER_ADMIN" ? "Master Admin" : role.charAt(0) + role.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.users
                  .filter((user) => {
                    const matchesSearch = !userSearch || 
                      (user.name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                      user.email.toLowerCase().includes(userSearch.toLowerCase());
                    const matchesRole = userRoleFilter === "ALL" ||
                      (userRoleFilter === "MASTER_ADMIN" ? user.isMasterAdmin : user.role === userRoleFilter);
                    return matchesSearch && matchesRole;
                  })
                  .map((user) => (
                  <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-neutral-300 shrink-0">
                        {(user.name || user.email)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                          {user.name || user.email.split("@")[0]}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap pl-11 sm:pl-0">
                      {user.isMasterAdmin && (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 text-xs">
                          <Crown className="h-3 w-3 mr-1" /> {t("admin.masterAdmin")}
                        </Badge>
                      )}
                      {user.role && (
                        <Badge className={`text-xs ${roleColors[user.role] || ""}`}>{user.role}</Badge>
                      )}
                      {user.email !== session?.user?.email && (
                        <>
                          {/* Reset Password */}
                          {resetPasswordUser === user.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder={t("admin.newPassword")}
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
                                {t("admin.set")}
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
                              <KeyRound className="h-3 w-3 mr-1" /> <span className="hidden sm:inline">{t("admin.resetPw")}</span><span className="sm:hidden">PW</span>
                            </Button>
                          )}
                          {/* Grant AI Credits */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => setGrantCreditsUser(user.id)}
                            disabled={actionLoading || user.creditGrantsThisMonth >= 3}
                            title={user.creditGrantsThisMonth >= 3 ? "Limit reached (3/month)" : `Grant AI Credits (bonus: ${user.bonusCredits})`}
                          >
                            <Coins className="h-3 w-3 mr-1" /> <span className="hidden sm:inline">Credits{user.bonusCredits > 0 ? ` (${user.bonusCredits})` : ""}</span><span className="sm:hidden">{user.bonusCredits || 0}</span>
                          </Button>
                          {user.canGrantMaster && (
                            <Button
                              size="sm"
                              variant={user.isMasterAdmin ? "destructive" : "outline"}
                              onClick={() => handleToggleMasterAdmin(user.id)}
                              disabled={actionLoading}
                              className="text-xs"
                            >
                              {user.isMasterAdmin ? t("admin.revokeMaster") : t("admin.grantMaster")}
                            </Button>
                          )}
                          {/* Delete User */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => setDeleteUserTarget({ id: user.id, email: user.email })}
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
                {data.users.filter((user) => {
                  const matchesSearch = !userSearch || 
                    (user.name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                    user.email.toLowerCase().includes(userSearch.toLowerCase());
                  const matchesRole = userRoleFilter === "ALL" ||
                    (userRoleFilter === "MASTER_ADMIN" ? user.isMasterAdmin : user.role === userRoleFilter);
                  return matchesSearch && matchesRole;
                }).length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No users match your filters
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workspaces Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Building2 className="h-5 w-5" /> {t("admin.allWorkspaces")}
            </h2>
            <Button
              size="sm"
              onClick={() => setShowCreateWorkspace(!showCreateWorkspace)}
              className="text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("admin.createWorkspace")}
            </Button>
          </div>

          {/* Create Workspace Form */}
          {showCreateWorkspace && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <form onSubmit={handleCreateWorkspace} className="space-y-3">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("admin.newWorkspace")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder={t("admin.workspaceName")}
                      value={newWsName}
                      onChange={(e) => setNewWsName(e.target.value)}
                      required
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <input
                      type="email"
                      placeholder={t("admin.ownerEmail")}
                      value={newWsOwnerEmail}
                      onChange={(e) => setNewWsOwnerEmail(e.target.value)}
                      required
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <ModernSelect
              options={[{ value: "FREE", label: "Free" }, { value: "PRO", label: "Pro" }, { value: "ENTERPRISE", label: "Enterprise" }]}
              value={newWsPlan}
              onChange={setNewWsPlan}
            />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={actionLoading} className="text-xs">
                      {t("admin.create")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreateWorkspace(false)} className="text-xs">
                      {t("admin.cancel")}
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{ws.name}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {ws._count.sites} {t("admin.sites")} · {ws._count.scans} {t("admin.scans")} · {ws._count.schedules} {t("admin.schedulesLabel")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Plan switcher */}
                      {changingPlan === ws.id ? (
                        <div className="flex items-center gap-1 flex-wrap">
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
                            {t("admin.cancel")}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Badge className={`text-xs ${planColors[ws.plan]}`}>{ws.plan}</Badge>
                          <Button size="sm" variant="outline" onClick={() => setChangingPlan(ws.id)} className="text-xs">
                            {t("admin.changePlan")}
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
                          {t("admin.members")} ({ws.members.length})
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => setShowAddUser(showAddUser === ws.id ? null : ws.id)}
                        >
                          <UserPlus className="h-3 w-3 mr-1" /> {t("admin.addUser")}
                        </Button>
                      </div>

                      {/* Add User Form */}
                      {showAddUser === ws.id && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                          <input
                            type="email"
                            placeholder="user@email.com"
                            value={addUserEmail}
                            onChange={(e) => setAddUserEmail(e.target.value)}
                            className="w-full min-w-0 flex-1 rounded border border-neutral-200 dark:border-neutral-700 px-2 py-1.5 text-xs dark:bg-neutral-800 dark:text-neutral-100"
                          />
                          <ModernSelect
              className="w-full sm:w-auto"
              options={[{ value: "OWNER", label: "Owner" }, { value: "ADMIN", label: "Admin" }, { value: "MEMBER", label: "Member" }, { value: "VIEWER", label: "Viewer" }]}
              value={addUserRole}
              onChange={setAddUserRole}
            />
                          <Button
                            size="sm"
                            className="w-full sm:w-auto shrink-0 text-xs"
                            onClick={() => handleAddUserToWorkspace(ws.id)}
                            disabled={actionLoading || !addUserEmail}
                          >
                            {t("admin.add")}
                          </Button>
                        </div>
                      )}
                      <div className="space-y-2">
                        {ws.members.map((member) => (
                          <div key={member.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm text-neutral-700 dark:text-neutral-200 truncate">
                                {member.user.name || member.user.email}
                              </span>
                              <Badge className={`text-xs shrink-0 ${roleColors[member.role]}`}>{member.role}</Badge>
                              {member.user.isMasterAdmin && (
                                <Crown className="h-3 w-3 shrink-0 text-amber-500" />
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <ModernSelect
                                options={[
                                  { value: "OWNER", label: "Owner" },
                                  { value: "ADMIN", label: "Admin" },
                                  { value: "MEMBER", label: "Member" },
                                  { value: "VIEWER", label: "Viewer" },
                                ]}
                                value={member.role}
                                onChange={(v) => handleChangeRole(ws.id, member.user.id, v)}
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-2"
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
      <ConfirmDialog
        open={!!deleteUserTarget}
        title="Delete user"
        description={`Permanently delete user "${deleteUserTarget?.email}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteUserTarget && handleDeleteUser(deleteUserTarget.id, deleteUserTarget.email)}
        onCancel={() => setDeleteUserTarget(null)}
      />
    </AppShell>
  );
}
