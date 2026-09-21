import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireBploSession() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "BPLO") {
    return null;
  }

  // Re-verify against DB so disabled or role-changed accounts lose access
  // immediately — not after JWT expiry. Mirrors requireJitSession behaviour.
  const dbUser = await prisma.user.findUnique({
    where: { userId: session.user.id },
    select: { userId: true, role: true, isActive: true },
  });

  if (!dbUser || dbUser.role !== "BPLO" || !dbUser.isActive) {
    return null;
  }

  return session;
}
