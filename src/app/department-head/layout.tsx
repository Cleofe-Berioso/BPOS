import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { requireDepartmentHeadSession } from "@/lib/department-head-api";
import { DepartmentHeadLayoutClient } from "@/components/department-head/department-head-layout-client";

export default async function DepartmentHeadLayout({ children }: { children: React.ReactNode }) {
  const session = await requireDepartmentHeadSession();
  if (!session) {
    // Use redirect() instead of signOut({ redirectTo }) to avoid an internal
    // server-side self-fetch that fails in production (TypeError: fetch failed).
    redirect("/login?error=session-expired");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <DepartmentHeadLayoutClient userName={session.user?.name ?? "Department Head"} signOutAction={handleSignOut}>
      {children}
    </DepartmentHeadLayoutClient>
  );
}