"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LogOut, PanelLeftOpen, UserCircle2, X } from "lucide-react";
import { RoleBadge } from "@/components/ui/role-badge";
import { actionButtonStyles } from "@/components/ui/action-button";

export const PORTAL_SIDEBAR_WIDTH = {
  expanded: "w-64",
  collapsed: "w-20",
} as const;

export const PORTAL_CONTENT_OFFSET = {
  expanded: "lg:pl-64",
  collapsed: "lg:pl-20",
} as const;

export function getPortalContentOffset(collapsed: boolean): string {
  return collapsed ? PORTAL_CONTENT_OFFSET.collapsed : PORTAL_CONTENT_OFFSET.expanded;
}

export function getPortalSidebarWidth(collapsed: boolean): string {
  return collapsed ? PORTAL_SIDEBAR_WIDTH.collapsed : PORTAL_SIDEBAR_WIDTH.expanded;
}

export function sidebarAsideClass(mobileOpen: boolean, collapsed: boolean): string {
  return [
    "app-sidebar no-print fixed inset-y-0 left-0 z-50 flex h-full flex-col transition-[width,transform] duration-200 lg:z-30",
    mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
    getPortalSidebarWidth(collapsed),
  ].join(" ");
}

export function sidebarNavLinkClass(active: boolean, collapsed: boolean): string {
  return [
    "app-sidebar-nav-link",
    active ? "app-sidebar-nav-link--active" : "app-sidebar-nav-link--inactive",
    collapsed ? "lg:justify-center lg:px-2" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function sidebarNavIconClass(active: boolean): string {
  return [
    "h-4 w-4 shrink-0",
    active ? "text-[var(--sidebar-active-indicator)]" : "text-[var(--sidebar-text-muted)]",
  ].join(" ");
}

export function sidebarNavLabelClass(collapsed: boolean): string {
  return collapsed ? "lg:hidden truncate" : "truncate";
}

export function sidebarGroupLabelClass(collapsed: boolean): string {
  return collapsed ? "lg:hidden app-sidebar-group-label" : "app-sidebar-group-label";
}

export function sidebarNavPaddingClass(collapsed: boolean): string {
  return collapsed ? "px-2" : "px-3";
}

export function sidebarHeaderClass(collapsed: boolean): string {
  return collapsed ? "app-sidebar-header app-sidebar-header--collapsed" : "app-sidebar-header";
}

export function PortalLayoutRoot({ children }: { children: ReactNode }) {
  return <div className="app-shell bg-transparent text-[var(--foreground)]">{children}</div>;
}

export function PortalMobileOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className="app-portal-overlay fixed inset-0 z-40 lg:hidden"
    />
  );
}

export function PortalNavToggles({
  mobileOpen,
  onMobileToggle,
  collapsed,
  onCollapseToggle,
}: {
  mobileOpen: boolean;
  onMobileToggle: () => void;
  collapsed: boolean;
  onCollapseToggle: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onMobileToggle}
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
        className="app-portal-nav-toggle inline-flex lg:hidden"
      >
        {mobileOpen ? <X className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onCollapseToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="app-portal-nav-toggle hidden lg:inline-flex"
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </>
  );
}

type PortalSidebarBrandProps = {
  portalTitle: string;
  description: string;
  roleType: "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT" | "VIEW_ONLY";
  roleLabel: string;
  collapsed: boolean;
};

export function PortalSidebarBrand({
  portalTitle,
  description,
  roleType,
  roleLabel,
  collapsed,
}: PortalSidebarBrandProps) {
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <div className="app-sidebar-brand-icon" title={portalTitle}>
          <Image src="/images/logo.png" alt="" width={34} height={34} className="h-full w-full object-contain" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="app-sidebar-brand-icon">
          <Image src="/images/logo.png" alt="" width={34} height={34} className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-active-text)]">
            Business Permit Online System
          </p>
          <h2 className="mt-0.5 text-[0.95rem] font-semibold leading-tight text-white">{portalTitle}</h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--sidebar-text-muted)]">{description}</p>
        </div>
      </div>
      <RoleBadge roleType={roleType} label={roleLabel} />
    </div>
  );
}

export function PortalSidebarFooter({
  userName,
  collapsed,
  onCollapseToggle,
}: {
  userName: string;
  collapsed: boolean;
  onCollapseToggle: () => void;
}) {
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="app-sidebar-footer mt-auto hidden shrink-0 lg:block">
      {collapsed ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCollapseToggle}
            aria-expanded={false}
            aria-label="Expand sidebar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--sidebar-text-muted)] transition-colors hover:bg-[var(--sidebar-hover-bg)] hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[rgba(197,160,89,0.15)] text-xs font-semibold text-[var(--sidebar-active-text)] ring-1 ring-[rgba(197,160,89,0.24)]">
              {initials || "U"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--sidebar-text)]">{userName}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--sidebar-text-muted)]">Signed in</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCollapseToggle}
            aria-expanded
            aria-label="Collapse sidebar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--sidebar-text-muted)] transition-colors hover:bg-[var(--sidebar-hover-bg)] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function PortalHeaderActions({
  name,
  roleLabel,
  profileHref,
  signOutAction,
  profileImageUrl,
  profileImageFailed,
  onProfileImageError,
}: {
  name: string;
  roleLabel: string;
  profileHref: string;
  signOutAction: () => Promise<void>;
  profileImageUrl?: string | null;
  profileImageFailed?: boolean;
  onProfileImageError?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5">
      <PortalHeaderUserMeta name={name} roleLabel={roleLabel} />
      <span className="app-portal-user-avatar">
        {profileImageUrl && !profileImageFailed ? (
          <img
            src={profileImageUrl}
            alt={name}
            className="h-full w-full object-cover"
            onError={onProfileImageError}
          />
        ) : (
          <UserCircle2 className="h-5 w-5" />
        )}
      </span>
      <Link href={profileHref} className={`${actionButtonStyles("secondary", "sm")} hidden sm:inline-flex`}>
        Profile
      </Link>
      <form action={signOutAction}>
        <button className={`${actionButtonStyles("primary", "sm")} inline-flex items-center gap-1.5`} type="submit">
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </form>
    </div>
  );
}

export function PortalHeaderBrand({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{eyebrow}</p>
      <h1 className="truncate text-[0.95rem] font-semibold leading-tight text-[var(--foreground)] sm:text-base">{title}</h1>
      <p className="truncate text-xs text-[var(--ink-muted)] sm:text-sm">{subtitle}</p>
    </div>
  );
}

export function PortalHeaderUserMeta({
  name,
  roleLabel,
}: {
  name: string;
  roleLabel: string;
}) {
  return (
    <div className="hidden min-w-0 text-right sm:block">
      <p className="truncate text-sm font-semibold text-[var(--foreground)]">{name}</p>
      <p className="truncate text-xs text-[var(--ink-muted)]">{roleLabel}</p>
    </div>
  );
}

export function PortalContentColumn({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`portal-content-column min-w-0 transition-[padding] duration-200 print:pl-0 ${getPortalContentOffset(collapsed)}`}
    >
      {children}
    </div>
  );
}

export function PortalTopHeader({ children }: { children: ReactNode }) {
  return (
    <header className="app-header no-print sticky top-0 z-30" data-app-chrome>
      <div className="app-portal-header-bar">{children}</div>
    </header>
  );
}

export function PortalMain({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell-main app-portal-main">
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </main>
  );
}

export function PortalGuardMain({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell-main app-portal-main">
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </main>
  );
}
