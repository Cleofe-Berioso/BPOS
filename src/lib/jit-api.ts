import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const authDiagnosticsEnabled = process.env.AUTH_DIAGNOSTICS === "1";

function logJitAuth(input: {
  pathname: string;
  userId: string | undefined;
  sessionRole: string | undefined;
  databaseRole: string | undefined;
  isActive: boolean | undefined;
  redirectDestination: string;
  reason: string;
}) {
  if (!authDiagnosticsEnabled) return;
  console.info("[auth:jit-session] decision", input);
}

export async function requireJitSession(pathname = "/jit") {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "JIT") {
    logJitAuth({
      pathname,
      userId: session?.user?.id,
      sessionRole: session?.user?.role,
      databaseRole: undefined,
      isActive: undefined,
      redirectDestination: "/login?error=account-disabled",
      reason: "missing-session-or-non-jit-role",
    });
    return null;
  }

  const activeJit = await prisma.user.findUnique({
    where: { userId: session.user.id },
    select: { userId: true, role: true, isActive: true },
  });

  if (!activeJit || activeJit.role !== "JIT" || !activeJit.isActive) {
    logJitAuth({
      pathname,
      userId: session.user.id,
      sessionRole: session.user.role,
      databaseRole: activeJit?.role,
      isActive: activeJit?.isActive,
      redirectDestination: "/login?error=account-disabled",
      reason: !activeJit
        ? "user-not-found"
        : activeJit.role !== "JIT"
          ? "database-role-mismatch"
          : "inactive-account",
    });
    return null;
  }

  logJitAuth({
    pathname,
    userId: session.user.id,
    sessionRole: session.user.role,
    databaseRole: activeJit.role,
    isActive: activeJit.isActive,
    redirectDestination: "",
    reason: "jit-session-valid",
  });

  return session;
}

/**
 * Check if JIT portal is currently enabled globally
 * Returns true if enabled, false if disabled
 */
export async function isJitPortalEnabled(): Promise<boolean> {
  const setting = await prisma.systemFeeSetting.findFirst({
    select: { jitPortalEnabled: true },
    orderBy: { updatedAt: "desc" },
  });
  return setting?.jitPortalEnabled ?? true;
}