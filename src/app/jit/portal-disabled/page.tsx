import { signOut } from "@/lib/auth";

export default async function JitPortalDisabledPage() {
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "linear-gradient(to bottom right, var(--sidebar-bg), color-mix(in srgb, var(--sidebar-bg) 75%, black))" }}
    >
      <div
        className="mx-auto max-w-md rounded-2xl border p-8 text-center shadow-2xl"
        style={{ borderColor: "var(--sidebar-border)", backgroundColor: "var(--sidebar-bg)" }}
      >
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="mb-2 text-2xl font-bold text-white">JIT Inspector Portal Disabled</h1>
        <p className="mb-6 text-white/75">
          The JIT Inspector Portal is currently disabled by the system administrator. Please contact your administrator for more information.
        </p>
        <form action={handleSignOut}>
          <button
            type="submit"
            className="w-full rounded-xl px-4 py-2.5 font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Return to Login
          </button>
        </form>
      </div>
    </div>
  );
}
