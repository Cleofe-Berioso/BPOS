"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar } from "@/components/ui/filter-bar";
import { InfoBanner } from "@/components/ui/info-banner";
import { RoleBadge } from "@/components/ui/role-badge";
import { StatCard } from "@/components/ui/stat-card";
import { ResponsiveDataTable } from "@/components/ui/responsive-data-table";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { actionButtonStyles } from "@/components/ui/action-button";
import {
  superadminFormControlClass,
  superadminTableClass,
} from "@/components/superadmin/superadmin-ui-styles";

import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { UserAccountIdCard } from "@/components/superadmin/user-account-id-card";
import { canSuperAdminResetPassword } from "@/lib/superadmin-password-reset";
import { autoCapitalizeWords } from "@/lib/text-input";
import type { PaginationPageSize } from "@/lib/pagination";

type RoleFilter = "ALL" | "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";
type StatusFilter = "ALL" | "ACTIVE" | "DISABLED";
type UserRole = "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";
type UserStatus = "ACTIVE" | "DISABLED";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  profileImageStoragePath: string | null;
  profilePictureUrl?: string | null;
};

type UserSummary = {
  totalUsers: number;
  applicants: number;
  bploAccounts: number;
  superAdmins: number;
  activeUsers: number;
  disabledUsers: number;
};

type Flash = { type: "success" | "danger" | "info"; message: string } | null;

const EMPTY_SUMMARY: UserSummary = {
  totalUsers: 0,
  applicants: 0,
  bploAccounts: 0,
  superAdmins: 0,
  activeUsers: 0,
  disabledUsers: 0,
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-PH");
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function statusBadge(status: UserStatus) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-flex rounded-full border border-[var(--success)] bg-[var(--success-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--success)]">
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-[var(--warning)] bg-[var(--warning-soft)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--warning)]">
      Disabled
    </span>
  );
}

export function SuperAdminUsersManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [summary, setSummary] = useState<UserSummary>(EMPTY_SUMMARY);
  const [searchInput, setSearchInput] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [flash, setFlash] = useState<Flash>(null);

  const [viewedUser, setViewedUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [showCreateBplo, setShowCreateBplo] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [disableTarget, setDisableTarget] = useState<UserRow | null>(null);
  const [disableReason, setDisableReason] = useState("");

  const [createForm, setCreateForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [resetForm, setResetForm] = useState({
    temporaryPassword: "",
    confirmPassword: "",
  });

  const createBploFormId = useId();
  const resetPasswordFormId = useId();

  async function loadUsers(next?: {
    search?: string;
    role?: RoleFilter;
    status?: StatusFilter;
    page?: number;
    pageSize?: PaginationPageSize;
  }) {
    const search = next?.search ?? searchApplied;
    const role = next?.role ?? roleFilter;
    const status = next?.status ?? statusFilter;
    const nextPage = next?.page ?? page;
    const nextPageSize = next?.pageSize ?? pageSize;

    setIsLoading(true);
    setFlash(null);

    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (role !== "ALL") params.set("role", role);
      if (status !== "ALL") params.set("status", status);
      params.set("page", String(nextPage));
      params.set("pageSize", String(nextPageSize));

      const res = await fetch(`/api/superadmin/users?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as {
        users?: UserRow[];
        pagination?: {
          totalCount?: number;
          page?: number;
          pageSize?: PaginationPageSize;
          totalPages?: number;
        };
        summary?: UserSummary;
        error?: string;
      };

      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to load users." });
        setUsers([]);
        setSummary(EMPTY_SUMMARY);
        setTotalCount(0);
        setTotalPages(1);
        return;
      }

      const usersWithPics = await Promise.all(
        (json.users ?? []).map(async (user: UserRow) => {
          if (!user.profileImageStoragePath) return user;
          try {
            const picRes = await fetch("/api/superadmin/users/profile-picture/signing-service", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ storagePath: user.profileImageStoragePath }),
            });
            const picData = (await picRes.json()) as { signedUrl?: string };
            return { ...user, profilePictureUrl: picData.signedUrl ?? null };
          } catch {
            return user;
          }
        })
      );
      setUsers(usersWithPics);
      setSummary(json.summary ?? EMPTY_SUMMARY);
      setTotalCount(json.pagination?.totalCount ?? usersWithPics.length);
      setPage(json.pagination?.page ?? nextPage);
      setPageSize(json.pagination?.pageSize ?? nextPageSize);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch {
      setFlash({ type: "danger", message: "Failed to load users." });
      setUsers([]);
      setSummary(EMPTY_SUMMARY);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, searchApplied, roleFilter, statusFilter]);

  const filteredCountLabel = useMemo(() => {
    return `${totalCount} user record${totalCount === 1 ? "" : "s"} matched the current filters.`;
  }, [totalCount]);

  async function submitCreateBplo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFlash(null);

    try {
      const res = await fetch("/api/superadmin/users/bplo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Failed to create BPLO account." });
        return;
      }

      setShowCreateBplo(false);
      setCreateForm({
        firstName: "",
        middleName: "",
        lastName: "",
        suffix: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
      setFlash({ type: "success", message: "BPLO account created successfully." });
      await loadUsers();
    } catch {
      setFlash({ type: "danger", message: "Failed to create BPLO account." });
    }
  }

  async function disableUser(user: UserRow) {
    setFlash(null);

    try {
      const payload = disableReason.trim().length > 0 ? { reason: disableReason.trim() } : undefined;
      const res = await fetch(`/api/superadmin/users/${user.id}/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const json = (await res.json()) as { error?: string };

      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Unable to disable account." });
        return;
      }

      setFlash({ type: "success", message: `Disabled account: ${user.email}` });
      setDisableTarget(null);
      setDisableReason("");
      await loadUsers();
    } catch {
      setFlash({ type: "danger", message: "Unable to disable account." });
    }
  }

  async function reactivateUser(user: UserRow) {
    setFlash(null);

    try {
      const res = await fetch(`/api/superadmin/users/${user.id}/reactivate`, { method: "POST" });
      const json = (await res.json()) as { error?: string };

      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Unable to reactivate account." });
        return;
      }

      setFlash({ type: "success", message: `Reactivated account: ${user.email}` });
      await loadUsers();
    } catch {
      setFlash({ type: "danger", message: "Unable to reactivate account." });
    }
  }

  async function submitResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetUser) return;

    setFlash(null);

    try {
      const res = await fetch(`/api/superadmin/users/${resetUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resetForm),
      });

      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFlash({ type: "danger", message: json.error ?? "Unable to reset password." });
        return;
      }

      setShowResetPassword(false);
      setResetUser(null);
      setResetForm({ temporaryPassword: "", confirmPassword: "" });
      setFlash({ type: "success", message: `Temporary password reset for ${resetUser.email}.` });
    } catch {
      setFlash({ type: "danger", message: "Unable to reset password." });
    }
  }

  const flashVariant = flash?.type === "danger" ? "danger" : flash?.type === "success" ? "success" : "info";

  return (
    <section className="ui-page-stack" aria-busy={isLoading}>
      <output aria-live="polite" className="sr-only">
        {isLoading ? "Loading users." : "Users loaded."}
      </output>
      <PageHeader
        title="User Management"
        description="Manage controlled system accounts and monitor registered applicants."
        badge={<RoleBadge roleType="VIEW_ONLY" label="Controlled Accounts" />}
        actions={
          <button
            type="button"
            onClick={() => setShowCreateBplo(true)}
            className={actionButtonStyles("primary", "sm")}
          >
            Create BPLO Account
          </button>
        }
      />

      {flash ? <InfoBanner title={flash.message} variant={flashVariant} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Total Users" value={summary.totalUsers.toLocaleString("en-PH")} subtitle="All registered accounts" tone="slate" />
        <StatCard title="Applicants" value={summary.applicants.toLocaleString("en-PH")} subtitle="Public applicant accounts" tone="green" />
        <StatCard title="BPLO Accounts" value={summary.bploAccounts.toLocaleString("en-PH")} subtitle="Controlled operations users" tone="blue" />
        <StatCard title="IT Administrators" value={summary.superAdmins.toLocaleString("en-PH")} subtitle="Controlled oversight users" tone="slate" />
        <StatCard
          title="Active / Disabled"
          value={`${summary.activeUsers.toLocaleString("en-PH")} / ${summary.disabledUsers.toLocaleString("en-PH")}`}
          subtitle="Account status overview"
          tone="slate"
        />
      </div>

      <FilterBar title="Search and Filters" description="Search by name/email and filter by role/status.">
        <input
          id="superadmin-users-search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search users by name or email"
          className={superadminFormControlClass}
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as RoleFilter);
            setPage(1);
          }}
          aria-label="Filter users by role"
          className={superadminFormControlClass}
        >
          <option value="ALL">All Roles</option>
          <option value="APPLICANT">Applicant</option>
          <option value="BPLO">BPLO</option>
          <option value="SUPER_ADMIN">IT Administrator</option>
          <option value="DEPARTMENT_HEAD">Department Head</option>
          <option value="JIT">JIT Inspector Portal</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(1);
          }}
          aria-label="Filter users by status"
          className={superadminFormControlClass}
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={actionButtonStyles("readOnly", "sm")}
            onClick={() => {
              setSearchApplied(searchInput.trim());
              setPage(1);
            }}
            disabled={isLoading}
          >
            Apply
          </button>
          <button
            type="button"
            className={actionButtonStyles("secondary", "sm")}
            onClick={() => {
              setSearchInput("");
              setSearchApplied("");
              setRoleFilter("ALL");
              setStatusFilter("ALL");
              setPage(1);
            }}
            disabled={isLoading}
          >
            Reset
          </button>
        </div>
      </FilterBar>

      <ResponsiveDataTable
        title="User Directory"
        description={isLoading ? "Loading users..." : filteredCountLabel}
        switchAt="xl"
        table={
          isLoading && users.length === 0 ? (
            <div className="p-5">
              <LoadingState message="Loading users…" compact />
            </div>
          ) : users.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No user records found" description="Try adjusting the current filters." />
            </div>
          ) : (
            <table className={superadminTableClass}>
              <thead>
                <tr>
                  <th className="px-4 py-3.5 font-semibold">Name</th>
                  <th className="px-4 py-3.5 font-semibold">Email</th>
                  <th className="px-4 py-3.5 font-semibold">Role</th>
                  <th className="px-4 py-3.5 font-semibold">Status</th>
                  <th className="px-4 py-3.5 font-semibold">Created Date</th>
                  <th className="px-4 py-3.5 font-semibold">Last Updated</th>
                  <th className="px-4 py-3.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const canToggleStatus = user.role !== "SUPER_ADMIN" && user.id !== currentUserId;
                  const canResetPassword = canSuperAdminResetPassword(user.role);

                  return (
                    <tr key={user.id} className="align-top">
                      <td className="px-4 py-3.5 font-medium text-[var(--foreground)]">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-color)] text-xs font-semibold"
                            style={{
                              backgroundColor: user.profilePictureUrl ? "transparent" : "var(--muted-surface)",
                              color: user.profilePictureUrl ? "transparent" : "var(--ink-muted)",
                            }}
                          >
                            {user.profilePictureUrl ? (
                              <img src={user.profilePictureUrl} alt={user.name} className="h-full w-full object-cover" />
                            ) : (
                              getInitials(user.name)
                            )}
                          </div>
                          <span>{user.name}</span>
                        </div>
                      </td>
                      <td className="max-w-[16rem] break-all px-4 py-3.5 text-[var(--ink-muted)]">{user.email}</td>
                      <td className="px-4 py-3.5">
                        <RoleBadge roleType={user.role} />
                      </td>
                      <td className="px-4 py-3.5">{statusBadge(user.status)}</td>
                      <td className="px-4 py-3.5 text-[var(--ink-muted)]">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3.5 text-[var(--ink-muted)]">{formatDate(user.updatedAt)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={actionButtonStyles("secondary", "sm")}
                            onClick={() => setViewedUser(user)}
                          >
                            View
                          </button>

                          {canToggleStatus ? (
                            user.status === "ACTIVE" ? (
                              <button
                                type="button"
                                className={actionButtonStyles("warning", "sm")}
                                onClick={() => {
                                  setDisableTarget(user);
                                  setDisableReason("");
                                }}
                              >
                                Disable
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={actionButtonStyles("secondary", "sm")}
                                onClick={() => void reactivateUser(user)}
                              >
                                Reactivate
                              </button>
                            )
                          ) : null}

                          {canResetPassword ? (
                            <button
                              type="button"
                              className={actionButtonStyles("readOnly", "sm")}
                              onClick={() => {
                                setResetUser(user);
                                setShowResetPassword(true);
                              }}
                            >
                              Reset Password
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }
        mobile={
          isLoading && users.length === 0 ? (
            <div className="p-5">
              <LoadingState message="Loading users…" compact />
            </div>
          ) : users.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No user records found" description="Try adjusting the current filters." />
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {users.map((user) => {
                const canToggleStatus = user.role !== "SUPER_ADMIN" && user.id !== currentUserId;
                const canResetPassword = canSuperAdminResetPassword(user.role);

                return (
                  <article key={user.id} className="app-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-color)] text-xs font-semibold"
                            style={{
                              backgroundColor: user.profilePictureUrl ? "transparent" : "var(--muted-surface)",
                              color: user.profilePictureUrl ? "transparent" : "var(--ink-muted)",
                            }}
                          >
                            {user.profilePictureUrl ? (
                              <img src={user.profilePictureUrl} alt={user.name} className="h-full w-full object-cover" />
                            ) : (
                              getInitials(user.name)
                            )}
                          </div>
                          <p className="text-sm font-semibold text-[var(--foreground)]">{user.name}</p>
                        </div>
                        <p className="break-all ui-caption">{user.email}</p>
                      </div>
                      {statusBadge(user.status)}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <RoleBadge roleType={user.role} />
                    </div>

                    <p className="mt-2 ui-caption">Created: {formatDate(user.createdAt)}</p>
                    <p className="ui-caption">Updated: {formatDate(user.updatedAt)}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={actionButtonStyles("secondary", "sm")}
                        onClick={() => setViewedUser(user)}
                      >
                        View
                      </button>

                      {canToggleStatus ? (
                        user.status === "ACTIVE" ? (
                          <button
                            type="button"
                            className={actionButtonStyles("warning", "sm")}
                            onClick={() => {
                              setDisableTarget(user);
                              setDisableReason("");
                            }}
                          >
                            Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={actionButtonStyles("secondary", "sm")}
                            onClick={() => void reactivateUser(user)}
                          >
                            Reactivate
                          </button>
                        )
                      ) : null}

                      {canResetPassword ? (
                        <button
                          type="button"
                          className={actionButtonStyles("readOnly", "sm")}
                          onClick={() => {
                            setResetUser(user);
                            setShowResetPassword(true);
                          }}
                        >
                          Reset Password
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        }
      />

      <PaginationControls
        basePath="/superadmin/users"
        queryParams={{}}
        mode="client"
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
        recordLabel="users"
        onPageChange={setPage}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
      />

      <Modal
        open={showCreateBplo}
        title="Create BPLO Account"
        description="Role is fixed to BPLO for controlled account provisioning."
        onClose={() => setShowCreateBplo(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={actionButtonStyles("secondary", "sm")}
              onClick={() => setShowCreateBplo(false)}
            >
              Cancel
            </button>
            <button type="submit" form={createBploFormId} className={actionButtonStyles("primary", "sm")}>Create BPLO Account</button>
          </div>
        }
      >
        <form id={createBploFormId} className="space-y-3" onSubmit={submitCreateBplo}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-first-name">First Name</label>
              <input
                id="create-bplo-first-name"
                value={createForm.firstName}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    firstName: autoCapitalizeWords(e.target.value),
                  }))
                }
                required
                autoCapitalize="words"
                className={superadminFormControlClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-last-name">Last Name</label>
              <input
                id="create-bplo-last-name"
                value={createForm.lastName}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    lastName: autoCapitalizeWords(e.target.value),
                  }))
                }
                required
                autoCapitalize="words"
                className={superadminFormControlClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-middle-name">Middle Name (optional)</label>
              <input
                id="create-bplo-middle-name"
                value={createForm.middleName}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    middleName: autoCapitalizeWords(e.target.value),
                  }))
                }
                autoCapitalize="words"
                className={superadminFormControlClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-suffix">Suffix (optional)</label>
              <input
                id="create-bplo-suffix"
                value={createForm.suffix}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    suffix: autoCapitalizeWords(e.target.value),
                  }))
                }
                autoCapitalize="words"
                className={superadminFormControlClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-email">Email</label>
            <input
              id="create-bplo-email"
              value={createForm.email}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
              required
              type="email"
              className={superadminFormControlClass}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-password">Temporary Password</label>
              <input
                id="create-bplo-password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                required
                minLength={8}
                type="password"
                className={superadminFormControlClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-confirm-password">Confirm Password</label>
              <input
                id="create-bplo-confirm-password"
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                required
                minLength={8}
                type="password"
                className={superadminFormControlClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="create-bplo-role">Role</label>
            <input
              id="create-bplo-role"
              defaultValue="BPLO"
              disabled
              readOnly
              className="w-full rounded-[var(--radius-card)] border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-2.5 text-sm font-semibold text-[var(--ink-muted)]"
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(disableTarget)}
        title="Disable Account"
        message={disableTarget ? <><span>Confirm disabling <span className="font-semibold">{disableTarget.email}</span>.</span><p className="mt-1 ui-caption">Role: {disableTarget.role}</p></> : undefined}
        confirmLabel="Confirm Disable"
        cancelLabel="Cancel"
        variant="danger"
        onClose={() => {
          setDisableTarget(null);
          setDisableReason("");
        }}
        onConfirm={() => void disableUser(disableTarget as UserRow)}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="disable-user-reason">Reason (optional)</label>
          <textarea
            id="disable-user-reason"
            value={disableReason}
            onChange={(e) => setDisableReason(e.target.value)}
            rows={3}
            className={superadminFormControlClass}
            placeholder="Enter optional reason for disable action"
          />
        </div>
      </ConfirmModal>

      <Modal
        open={Boolean(viewedUser)}
        title="Account ID Card"
        description="Official read-only account identification for this user."
        size="md"
        onClose={() => setViewedUser(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={actionButtonStyles("secondary", "sm")}
              onClick={() => {
                setViewedUser(null);
              }}
            >
              Close
            </button>
          </div>
        }
      >
        {viewedUser ? <UserAccountIdCard user={viewedUser} /> : null}
      </Modal>

      <Modal
        open={showResetPassword && Boolean(resetUser)}
        title="Reset Temporary Password"
        description={
          resetUser
            ? `Set a temporary password for ${resetUser.email}. This action is allowed only for JIT and Department Head accounts.`
            : undefined
        }
        onClose={() => {
          setShowResetPassword(false);
          setResetUser(null);
          setResetForm({ temporaryPassword: "", confirmPassword: "" });
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={actionButtonStyles("secondary", "sm")}
              onClick={() => {
                setShowResetPassword(false);
                setResetUser(null);
                setResetForm({ temporaryPassword: "", confirmPassword: "" });
              }}
            >
              Cancel
            </button>
            <button type="submit" form={resetPasswordFormId} className={actionButtonStyles("primary", "sm")}>Reset Password</button>
          </div>
        }
      >
        <form id={resetPasswordFormId} className="space-y-3" onSubmit={submitResetPassword}>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="reset-temporary-password">Temporary Password</label>
            <input
              id="reset-temporary-password"
              value={resetForm.temporaryPassword}
              onChange={(e) => setResetForm((prev) => ({ ...prev, temporaryPassword: e.target.value }))}
              required
              minLength={8}
              type="password"
              className={superadminFormControlClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]" htmlFor="reset-confirm-password">Confirm Password</label>
            <input
              id="reset-confirm-password"
              value={resetForm.confirmPassword}
              onChange={(e) => setResetForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              required
              minLength={8}
              type="password"
              className={superadminFormControlClass}
            />
          </div>
        </form>
      </Modal>
    </section>
  );
}
