import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { requireBploSession } from "@/lib/bplo-api";
import { BploLayoutClient } from "@/components/bplo/bplo-layout-client";

export default async function BploLayout({ children }: { children: React.ReactNode }) {
  const session = await requireBploSession();
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
    <BploLayoutClient userName={session.user?.name ?? "BPLO"} signOutAction={handleSignOut}>
      {children}
    </BploLayoutClient>
  );
}
