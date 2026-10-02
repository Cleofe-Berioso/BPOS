"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FileText, FolderOpen, LayoutDashboard, Receipt, User } from "lucide-react";
import {
  PortalSidebarBrand,
  PortalSidebarFooter,
  sidebarAsideClass,
  sidebarGroupLabelClass,
  sidebarHeaderClass,
  sidebarNavIconClass,
  sidebarNavLabelClass,
  sidebarNavLinkClass,
  sidebarNavPaddingClass,
} from "@/components/ui/portal-layout-shell";

type SidebarItem = {
  label: string;
  href: string;
};

type SidebarGroup = {
  group: string;
  items: SidebarItem[];
} | SidebarItem;

const APPLICANT_SIDEBAR_STRUCTURE: SidebarGroup[] = [
  { label: "Dashboard", href: "/applicant/dashboard" },
  {
    group: "Applications",
    items: [
      { label: "File Application", href: "/applicant/application" },
      { label: "My Applications", href: "/applicant/my-applications" },
      { label: "Tax Order of Payment", href: "/applicant/top" },
    ],
  },
  { label: "Notifications", href: "/applicant/notifications" },
  { label: "Profile", href: "/applicant/profile" },
];

const SIDEBAR_ICONS = {
  Dashboard: LayoutDashboard,
  "File Application": FileText,
  "My Applications": FolderOpen,
  "Tax Order of Payment": Receipt,
  Notifications: Bell,
  Profile: User,
} as const;

export function ApplicantSidebar({
  mobileOpen,
  collapsed,
  onCloseMobile,
  userName,
  onCollapseToggle,
}: {
  mobileOpen: boolean;
  collapsed: boolean;
  onCloseMobile: () => void;
  userName: string;
  onCollapseToggle: () => void;
}) {
  const pathname = usePathname();

  const renderNavItem = (item: SidebarItem) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = SIDEBAR_ICONS[item.label as keyof typeof SIDEBAR_ICONS];

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onCloseMobile}
        className={sidebarNavLinkClass(active, collapsed)}
        title={collapsed ? item.label : undefined}
      >
        {Icon ? <Icon className={sidebarNavIconClass(active)} /> : null}
        <span className={sidebarNavLabelClass(collapsed)}>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className={sidebarAsideClass(mobileOpen, collapsed)}>
      <div className={sidebarHeaderClass(collapsed)}>
        <PortalSidebarBrand
          portalTitle="Applicant Portal"
          description="File, track, and monitor permit transactions."
          roleType="APPLICANT"
          roleLabel="Applicant"
          collapsed={collapsed}
        />
      </div>

      <nav className={`app-sidebar-nav ${sidebarNavPaddingClass(collapsed)}`} aria-label="Applicant navigation">
        {APPLICANT_SIDEBAR_STRUCTURE.map((item, idx) => {
          if ("href" in item) {
            return (
              <div key={item.href} className={idx > 0 ? "mt-1" : ""}>
                {renderNavItem(item)}
              </div>
            );
          }

          return (
            <div key={item.group} className="mt-4">
              <p className={sidebarGroupLabelClass(collapsed)}>{item.group}</p>
              {collapsed ? <div className="app-sidebar-group-divider" /> : null}
              <div className="space-y-0.5">{item.items.map((subitem) => renderNavItem(subitem))}</div>
            </div>
          );
        })}
      </nav>

      <PortalSidebarFooter userName={userName} collapsed={collapsed} onCollapseToggle={onCollapseToggle} />
    </aside>
  );
}
