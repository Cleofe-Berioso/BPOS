import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signOut } from "@/lib/auth";
import { requireJitSession, isJitPortalEnabled } from "@/lib/jit-api";
import { JitLayoutClient } from "@/components/jit/jit-layout-client";

const authDiagnosticsEnabled = process.env.AUTH_DIAGNOSTICS === "1";

export default async function JitLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-ebpls-pathname") ?? "/jit";

  const session = await requireJitSession(pathname);
  if (!session) redirect("/login?error=account-disabled");

  const portalEnabled = await isJitPortalEnabled();
  if (!portalEnabled && pathname !== "/jit/portal-disabled") {
    if (authDiagnosticsEnabled) {
      console.info("[auth:jit-layout] redirect", {
        pathname,
        userId: session.user?.id,
        sessionRole: session.user?.role,
        destination: "/jit/portal-disabled",
        reason: "jit-portal-disabled",
      });
    }
    redirect("/jit/portal-disabled");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return <JitLayoutClient userName={session.user?.name ?? "JIT Inspector Portal"} signOutAction={handleSignOut}>{children}</JitLayoutClient>;
}