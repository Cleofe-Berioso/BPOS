"use client";

import { useState, type ReactNode } from "react";
import { JitSidebar } from "@/components/jit/jit-sidebar";
import {
  PortalContentColumn,
  PortalHeaderActions,
  PortalHeaderBrand,
  PortalLayoutRoot,
  PortalMain,
  PortalMobileOverlay,
  PortalNavToggles,
  PortalTopHeader,
} from "@/components/ui/portal-layout-shell";

export function JitLayoutClient({
  userName,
  signOutAction,
  children,
}: {
  userName: string;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <PortalLayoutRoot>
      <PortalMobileOverlay open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <JitSidebar
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        onCloseMobile={() => setMobileOpen(false)}
        userName={userName}
        onCollapseToggle={() => setCollapsed((value) => !value)}
      />

      <PortalContentColumn collapsed={collapsed}>
        <PortalTopHeader>
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <PortalNavToggles
                mobileOpen={mobileOpen}
                onMobileToggle={() => setMobileOpen((value) => !value)}
                collapsed={collapsed}
                onCollapseToggle={() => setCollapsed((value) => !value)}
              />
              <div className="min-w-0 sm:hidden">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                  JIT Inspector
                </p>
              </div>
              <div className="hidden min-w-0 sm:block">
                <PortalHeaderBrand
                  eyebrow="JIT Inspector Portal"
                  title={`Welcome, ${userName}`}
                  subtitle="Inspection and compliance operations"
                />
              </div>
            </div>

            <PortalHeaderActions
              name={userName}
              roleLabel="JIT Inspector Portal"
              signOutAction={signOutAction}
            />
          </div>
        </PortalTopHeader>

        <PortalMain>{children}</PortalMain>
      </PortalContentColumn>
    </PortalLayoutRoot>
  );
}
