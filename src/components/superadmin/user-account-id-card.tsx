"use client";

import Image from "next/image";
import { RoleBadge } from "@/components/ui/role-badge";

type UserRole = "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";
type UserStatus = "ACTIVE" | "DISABLED";

export type UserAccountIdCardData = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  profilePictureUrl?: string | null;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatAccountId(id: string): string {
  const compact = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const core = compact.slice(-12).padStart(12, "0");
  return `EBPLS-${core.slice(0, 4)}-${core.slice(4, 8)}-${core.slice(8, 12)}`;
}

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function roleLabel(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "IT Administrator";
    case "DEPARTMENT_HEAD":
      return "Department Head";
    case "JIT":
      return "JIT Inspector Portal";
    case "BPLO":
      return "BPLO Staff";
    default:
      return "Applicant";
  }
}

function IdField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-[var(--foreground)]" title={value}>
        {value}
      </p>
    </div>
  );
}

export function UserAccountIdCard({ user }: { user: UserAccountIdCardData }) {
  const accountId = formatAccountId(user.id);
  const isActive = user.status === "ACTIVE";

  return (
    <article
      className="mx-auto w-full max-w-[26rem] overflow-hidden rounded-2xl border-2 border-[var(--primary-strong)] bg-white shadow-[var(--card-shadow-hover)]"
      aria-label={`Account ID card for ${user.name}`}
    >
      <header className="relative bg-[var(--primary-strong)] px-4 py-3 text-white">
        <div className="absolute inset-x-0 top-0 h-1 bg-[var(--accent)]" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/95 p-1">
            <Image src="/images/logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-soft)]">
              Municipality of Enrique B. Magalona
            </p>
            <p className="truncate text-sm font-bold tracking-wide">BPOS User Account ID</p>
          </div>
        </div>
      </header>

      <div className="relative px-4 py-4">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[var(--primary-soft)] opacity-70"
          aria-hidden="true"
        />

        <div className="relative flex gap-4">
          <div className="shrink-0">
            <div className="flex h-[6.5rem] w-[5.25rem] items-center justify-center overflow-hidden rounded-xl border-2 border-[var(--primary)] bg-[var(--muted-surface)] shadow-sm">
              {user.profilePictureUrl ? (
                <img src={user.profilePictureUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-[var(--primary-strong)]">{getInitials(user.name)}</span>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              Photo
            </p>
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Full Name</p>
            <h3 className="mt-0.5 text-lg font-bold leading-tight text-[var(--foreground)]">{user.name}</h3>

            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Role</p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--primary-strong)]">{roleLabel(user.role)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RoleBadge roleType={user.role} />
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                  isActive
                    ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                    : "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
                }`}
              >
                {isActive ? "Active" : "Disabled"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border-color)] bg-[var(--muted-surface)] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">Account ID</p>
          <p className="mt-1 font-mono text-base font-bold tracking-[0.08em] text-[var(--primary-strong)]">{accountId}</p>
          <p className="mt-1 break-all font-mono text-[10px] text-[var(--ink-muted)]" title={user.id}>
            Ref: {user.id}
          </p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <IdField label="Email" value={user.email} />
          <IdField label="Last Login" value="Not recorded" />
          <IdField label="Registered" value={formatShortDate(user.createdAt)} />
          <IdField label="Last Updated" value={formatShortDate(user.updatedAt)} />
        </div>
      </div>

      <footer className="border-t border-[var(--border-color)] bg-[var(--surface-header)] px-4 py-2.5">
        <p className="text-center text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Official system account record • Read only
        </p>
      </footer>
    </article>
  );
}
