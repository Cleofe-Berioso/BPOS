import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { requireApplicantSession } from "@/lib/applicant-api";
import { ApplicantLayoutClient } from "@/components/applicant/applicant-layout-client";

export default async function ApplicantLayout({ children }: { children: React.ReactNode }) {
  const session = await requireApplicantSession();
  if (!session) {
    // Use redirect() instead of signOut({ redirectTo }) here.
    // signOut with redirectTo triggers an internal server-side fetch that fails in
    // production when AUTH_URL resolves to an unreachable host (e.g. localhost:3000).
    // The session JWT expiry / invalidation is handled by the jwt callback in auth.ts;
    // the cookie will expire naturally. Redirecting to the login page is sufficient.
    redirect("/login?error=session-expired");
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <ApplicantLayoutClient userName={session.user?.name ?? "Applicant"} signOutAction={handleSignOut}>
      {children}
    </ApplicantLayoutClient>
  );
}
